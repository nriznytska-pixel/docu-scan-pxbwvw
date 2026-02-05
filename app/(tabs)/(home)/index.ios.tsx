
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import Constants from 'expo-constants';

interface AnalysisData {
  content: [{ text: string }];
}

interface ParsedAnalysisContent {
  sender?: string;
  type?: string;
  summary_ua: string;
  deadline?: string;
  amount?: number;
  urgency?: 'low' | 'medium' | 'high';
  templates?: string[];
  steps?: string[];
}

interface ScannedDocument {
  id: string;
  image_url: string;
  created_at: string;
  analysis?: AnalysisData;
  language?: string;
  user_id?: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  'bezwaar': '✍️ Оскаржити',
  'betalingsregeling': '💰 Розстрочка',
  'uitstel': '⏰ Більше часу',
  'foto_opvragen': '📷 Запросити фото',
  'adresbevestiging': '📍 Підтвердити адресу',
};

const DEFAULT_LANGUAGE = 'uk';

export default function HomeScreen() {
  console.log('HomeScreen (iOS): Component rendered');
  
  const router = useRouter();
  const { selectedLanguage } = useLanguage();
  const { user } = useAuth();
  
  // Log the current language whenever component renders
  console.log('HomeScreen (iOS): Current selectedLanguage from context:', selectedLanguage);
  
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingResponse, setGeneratingResponse] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState<string>('');
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [detailImageError, setDetailImageError] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const FREE_SCAN_LIMIT = 3;

  useEffect(() => {
    console.log('HomeScreen (iOS): Initial load - fetching scans');
    fetchScans();
  }, []);

  // Set up real-time subscription for scan updates
  useEffect(() => {
    if (!user) {
      console.log('HomeScreen (iOS): No user, skipping real-time subscription');
      return;
    }

    console.log('HomeScreen (iOS): Setting up real-time subscription for user:', user.id);

    // Subscribe to changes in the scans table for this user
    const channel = supabase
      .channel('scans-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scans',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('HomeScreen (iOS): Real-time update received:', payload);
          
          if (payload.eventType === 'INSERT') {
            console.log('HomeScreen (iOS): New scan inserted, refreshing list');
            fetchScans();
          } else if (payload.eventType === 'UPDATE') {
            console.log('HomeScreen (iOS): Scan updated:', payload.new);
            const updatedScan = payload.new as ScannedDocument;
            
            // Update the documents list
            setDocuments((prev) => 
              prev.map((doc) => 
                doc.id === updatedScan.id ? updatedScan : doc
              )
            );
            
            // If this is the currently selected document, update it
            if (selectedDocument && selectedDocument.id === updatedScan.id) {
              console.log('HomeScreen (iOS): Updating selected document with new analysis');
              setSelectedDocument(updatedScan);
            }
          } else if (payload.eventType === 'DELETE') {
            console.log('HomeScreen (iOS): Scan deleted, refreshing list');
            fetchScans();
          }
        }
      )
      .subscribe((status) => {
        console.log('HomeScreen (iOS): Subscription status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      console.log('HomeScreen (iOS): Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user, selectedDocument]);

  // Poll for updates on the selected document if analysis is pending
  useEffect(() => {
    if (!selectedDocument || selectedDocument.analysis) {
      // No need to poll if no document selected or analysis already exists
      return;
    }

    console.log('HomeScreen (iOS): Starting polling for scan analysis:', selectedDocument.id);

    const pollInterval = setInterval(async () => {
      console.log('HomeScreen (iOS): Polling for analysis update...');
      
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('*')
          .eq('id', selectedDocument.id)
          .single();

        if (error) {
          console.error('HomeScreen (iOS): Error polling for scan:', error);
          return;
        }

        if (data && data.analysis) {
          console.log('HomeScreen (iOS): Analysis found! Updating selected document');
          setSelectedDocument(data);
          
          // Also update in the documents list
          setDocuments((prev) =>
            prev.map((doc) => (doc.id === data.id ? data : doc))
          );
        }
      } catch (err) {
        console.error('HomeScreen (iOS): Exception while polling:', err);
      }
    }, 5000); // Poll every 5 seconds

    // Cleanup interval on unmount or when analysis arrives
    return () => {
      console.log('HomeScreen (iOS): Stopping polling for scan analysis');
      clearInterval(pollInterval);
    };
  }, [selectedDocument]);

  useEffect(() => {
    const fetchScanCount = async () => {
      if (!user) return;
      try {
        const { count, error } = await supabase
          .from('scans')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (!error && count !== null) {
          setScanCount(count);
          console.log('HomeScreen: User scan count:', count);
        }
      } catch (e) {
        console.error('Error fetching scan count:', e);
      }
    };
    fetchScanCount();
  }, [user, documents]);

  const parseAnalysis = (analysisJson: AnalysisData | undefined): ParsedAnalysisContent | null => {
    console.log('HomeScreen (iOS): Parsing analysis data:', JSON.stringify(analysisJson, null, 2));
    
    if (!analysisJson || !analysisJson.content || analysisJson.content.length === 0) {
      console.log('HomeScreen (iOS): No analysis data available');
      return null;
    }

    try {
      const textContent = analysisJson.content[0].text;
      console.log('HomeScreen (iOS): Raw text content:', textContent);
      
      // Extract JSON from markdown code block (```json ... ```)
      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
      
      let jsonString = textContent;
      if (jsonMatch && jsonMatch[1]) {
        jsonString = jsonMatch[1].trim();
        console.log('HomeScreen (iOS): Extracted JSON from markdown wrapper');
      } else {
        console.log('HomeScreen (iOS): No markdown wrapper found, parsing as-is');
      }
      
      console.log('HomeScreen (iOS): JSON string to parse:', jsonString);
      const parsed = JSON.parse(jsonString);
      console.log('HomeScreen (iOS): Successfully parsed analysis:', JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (e) {
      console.error('HomeScreen (iOS): Failed to parse analysis JSON:', e);
      return null;
    }
  };

  const generateGoogleCalendarUrl = (sender: string, deadline: string, summary: string): string => {
    console.log('HomeScreen (iOS): Generating Google Calendar URL');
    console.log('HomeScreen (iOS): Sender:', sender);
    console.log('HomeScreen (iOS): Deadline:', deadline);
    console.log('HomeScreen (iOS): Summary:', summary);
    
    const title = `Дедлайн: ${sender}`;
    const formattedDate = `${deadline}/${deadline}`;
    
    const encodedTitle = encodeURIComponent(title);
    const encodedDetails = encodeURIComponent(summary);
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${formattedDate}&details=${encodedDetails}`;
    
    console.log('HomeScreen (iOS): Generated calendar URL:', url);
    return url;
  };

  const openGoogleCalendar = (sender: string, deadline: string, summary: string) => {
    console.log('HomeScreen (iOS): User tapped "Додати в календар" button');
    
    const calendarUrl = generateGoogleCalendarUrl(sender, deadline, summary);
    
    Linking.openURL(calendarUrl)
      .then(() => {
        console.log('HomeScreen (iOS): Successfully opened Google Calendar');
      })
      .catch((err) => {
        console.error('HomeScreen (iOS): Failed to open Google Calendar:', err);
        Alert.alert('Помилка', 'Не вдалося відкрити Google Calendar');
      });
  };

  const handleTemplatePress = async (templateType: string, analysis: ParsedAnalysisContent) => {
    console.log('HomeScreen (iOS): User tapped template button:', templateType);
    console.log('HomeScreen (iOS): Analysis data:', JSON.stringify(analysis, null, 2));
    
    setGeneratingResponse(true);
    
    const webhookUrl = 'https://hook.eu1.make.com/w2ulfcq5936zqn4vwbjd6uy3g90aijuc';
    
    const requestBody = {
      sender: analysis.sender || '',
      type: analysis.type || '',
      summary_ua: analysis.summary_ua || '',
      deadline: analysis.deadline || '',
      amount: analysis.amount || null,
      template_type: templateType,
    };
    
    console.log('HomeScreen (iOS): Sending webhook request to:', webhookUrl);
    console.log('HomeScreen (iOS): Request body:', JSON.stringify(requestBody, null, 2));
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log('HomeScreen (iOS): Webhook response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('HomeScreen (iOS): Webhook response data:', JSON.stringify(responseData, null, 2));
      
      // Parse response with flexible content path handling
      const content = responseData?.data?.content || responseData?.content;
      if (content && content[0]) {
        const responseText = content[0].text;
        console.log('HomeScreen (iOS): Extracted response text:', responseText);
        
        setGeneratedResponse(responseText);
        setGeneratingResponse(false);
        setShowResponseModal(true);
      } else {
        console.error('HomeScreen (iOS): Unexpected response structure');
        Alert.alert('Помилка', 'Отримано некоректну відповідь від сервера');
        setGeneratingResponse(false);
      }
    } catch (error) {
      console.error('HomeScreen (iOS): Error calling webhook:', error);
      Alert.alert('Помилка', 'Не вдалося згенерувати відповідь. Спробуйте ще раз.');
      setGeneratingResponse(false);
    }
  };

  const copyToClipboard = () => {
    console.log('HomeScreen (iOS): User tapped "Копіювати" button');
    Clipboard.setString(generatedResponse);
    Alert.alert('Успіх', 'Текст скопійовано в буфер обміну');
  };

  const sendEmail = () => {
    console.log('HomeScreen (iOS): User tapped "Надіслати email" button');
    const emailUrl = `mailto:?body=${encodeURIComponent(generatedResponse)}`;
    
    Linking.openURL(emailUrl)
      .then(() => {
        console.log('HomeScreen (iOS): Successfully opened email app');
      })
      .catch((err) => {
        console.error('HomeScreen (iOS): Failed to open email app:', err);
        Alert.alert('Помилка', 'Не вдалося відкрити додаток електронної пошти');
      });
  };

  const closeResponseModal = () => {
    console.log('HomeScreen (iOS): Closing response modal');
    setShowResponseModal(false);
    setGeneratedResponse('');
  };

  const handleImageError = (docId: string) => {
    console.log('HomeScreen (iOS): Image failed to load for document:', docId);
    setImageLoadErrors(prev => ({ ...prev, [docId]: true }));
  };

  const handleDetailImageError = () => {
    console.log('HomeScreen (iOS): Detail image failed to load');
    setDetailImageError(true);
  };

  const fetchScans = async () => {
    console.log('HomeScreen (iOS): fetchScans started');
    
    if (!user) {
      console.log('HomeScreen (iOS): No user logged in, skipping fetch');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      console.log('HomeScreen (iOS): Fetching scans for user:', user.id);
      
      const { data, error } = await supabase
        .from('scans')
        .select('id, image_url, created_at, analysis, language, user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('HomeScreen (iOS): Error fetching scans:', JSON.stringify(error, null, 2));
        return;
      }

      const scansCount = data?.length || 0;
      console.log('HomeScreen (iOS): Successfully fetched scans, count:', scansCount);
      
      // Log the language of each scan for debugging
      if (data && data.length > 0) {
        console.log('HomeScreen (iOS): Recent scans with languages:');
        data.slice(0, 3).forEach((scan, index) => {
          console.log(`  Scan ${index + 1}: language="${scan.language || 'null'}", user_id="${scan.user_id}", has_analysis=${!!scan.analysis}`);
        });
      }
      
      setDocuments(data || []);
    } catch (error) {
      console.error('HomeScreen (iOS): Exception in fetchScans:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    console.log('HomeScreen (iOS): Requesting camera permission');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('HomeScreen (iOS): Camera permission denied');
      Alert.alert(
        'Дозвіл потрібен',
        'Будь ласка, надайте доступ до камери для сканування документів.'
      );
      return false;
    }
    
    console.log('HomeScreen (iOS): Camera permission granted');
    return true;
  };

  const compressImage = async (uri: string): Promise<string | null> => {
    console.log('HomeScreen (iOS): Starting image compression for URI:', uri);
    try {
      let currentCompress = 0.8;
      let compressedImage = await manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
      );

      if (!compressedImage.base64) {
        console.error('HomeScreen (iOS): No base64 data from compression');
        return null;
      }

      const MAX_SIZE_BYTES = 1 * 1024 * 1024;
      let currentBase64 = compressedImage.base64;
      let estimatedSize = currentBase64.length * 0.75;

      console.log('HomeScreen (iOS): Initial compressed size:', Math.round(estimatedSize), 'bytes');

      while (estimatedSize > MAX_SIZE_BYTES && currentCompress > 0.1) {
        currentCompress -= 0.1;
        console.log('HomeScreen (iOS): Recompressing with quality:', currentCompress.toFixed(1));
        
        const reCompressed = await manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }],
          { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
        );
        
        if (reCompressed.base64) {
          currentBase64 = reCompressed.base64;
          estimatedSize = currentBase64.length * 0.75;
          console.log('HomeScreen (iOS): New size:', Math.round(estimatedSize), 'bytes');
        } else {
          break;
        }
      }

      const finalSize = Math.round(estimatedSize);
      console.log('HomeScreen (iOS): Compression complete, final size:', finalSize, 'bytes');
      return currentBase64;
    } catch (error) {
      console.error('HomeScreen (iOS): Error in compressImage:', error);
      return null;
    }
  };

  const uploadToSupabase = async (base64: string): Promise<string | null> => {
    console.log('HomeScreen (iOS): Starting Supabase upload');
    try {
      const fileExt = 'jpeg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `public/${fileName}`;

      console.log('HomeScreen (iOS): Uploading to bucket "letters", path:', filePath);

      const arrayBuffer = decode(base64);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('letters')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) {
        console.error('HomeScreen (iOS): Upload error:', JSON.stringify(uploadError, null, 2));
        return null;
      }

      console.log('HomeScreen (iOS): Upload successful, creating signed URL');

      const { data: urlData, error: urlError } = await supabase.storage
        .from('letters')
        .createSignedUrl(filePath, 300);

      if (urlError) {
        console.error('HomeScreen (iOS): Error creating signed URL:', JSON.stringify(urlError, null, 2));
        return null;
      }

      const signedUrl = urlData.signedUrl;
      console.log('HomeScreen (iOS): Signed URL obtained:', signedUrl);
      return signedUrl;
    } catch (error) {
      console.error('HomeScreen (iOS): Exception in uploadToSupabase:', error);
      return null;
    }
  };

  const saveToDatabase = async (imageUrl: string): Promise<boolean> => {
    console.log('HomeScreen (iOS): ========== SAVING TO DATABASE ==========');
    console.log('HomeScreen (iOS): Image URL:', imageUrl);
    
    // Get the current language at the time of saving (not from closure)
    const languageToSave = selectedLanguage || DEFAULT_LANGUAGE;
    console.log('HomeScreen (iOS): 🔍 CRITICAL - Language to save:', languageToSave);
    console.log('HomeScreen (iOS): 🔍 CRITICAL - Language type:', typeof languageToSave);
    
    if (!user) {
      console.error('HomeScreen (iOS): No user logged in, cannot save scan');
      Alert.alert('Помилка', 'Ви повинні увійти в систему для збереження сканів');
      return false;
    }
    
    console.log('HomeScreen (iOS): 🔍 User ID:', user.id);
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      language: languageToSave,
      user_id: user.id,
    };
    
    console.log('HomeScreen (iOS): 🔍 CRITICAL - Full data object to insert:', JSON.stringify(dataToInsert, null, 2));
    
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('scans')
        .insert([dataToInsert])
        .select();

      if (insertError) {
        console.error('HomeScreen (iOS): ========== INSERT ERROR ==========');
        console.error('Full error:', JSON.stringify(insertError, null, 2));
        console.error('Message:', insertError.message);
        console.error('Code:', insertError.code);
        console.error('Details:', insertError.details);
        console.error('Hint:', insertError.hint);
        
        Alert.alert(
          'Помилка збереження',
          `Не вдалося зберегти запис.\n\nПовідомлення: ${insertError.message}\nКод: ${insertError.code || 'N/A'}\n\nПеревірте налаштування таблиці "scans" у Supabase.`
        );
        return false;
      }

      console.log('HomeScreen (iOS): ========== INSERT SUCCESS ==========');
      console.log('HomeScreen (iOS): 🔍 CRITICAL - Data returned from Supabase:', JSON.stringify(insertData, null, 2));
      
      // Verify the language was saved correctly
      if (insertData && insertData.length > 0) {
        const savedLanguage = insertData[0].language;
        console.log('HomeScreen (iOS): 🔍 CRITICAL - Language saved in database:', savedLanguage);
        if (savedLanguage !== languageToSave) {
          console.error('HomeScreen (iOS): ⚠️ WARNING - Language mismatch!');
          console.error(`  Expected: "${languageToSave}"`);
          console.error(`  Got: "${savedLanguage}"`);
        } else {
          console.log('HomeScreen (iOS): ✅ Language saved correctly!');
        }
      }
      
      // Also create a scan record in the backend API with the language
      console.log('HomeScreen (iOS): Creating scan record in backend API');
      const backendUrl = Constants.expoConfig?.extra?.backendUrl;
      
      if (backendUrl) {
        try {
          console.log('HomeScreen (iOS): 🔍 Sending language to backend:', languageToSave);
          const backendResponse = await fetch(`${backendUrl}/scans`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ language: languageToSave }),
          });
          
          if (backendResponse.ok) {
            const backendData = await backendResponse.json();
            console.log('HomeScreen (iOS): Backend scan created:', JSON.stringify(backendData, null, 2));
          } else {
            console.error('HomeScreen (iOS): Backend API error:', backendResponse.status);
          }
        } catch (backendError: any) {
          console.error('HomeScreen (iOS): Backend API exception:', backendError?.message);
          // Don't fail the whole operation if backend API fails
        }
      } else {
        console.warn('HomeScreen (iOS): Backend URL not configured, skipping backend API call');
      }
      
      return true;
    } catch (error: any) {
      console.error('HomeScreen (iOS): ========== EXCEPTION IN SAVE ==========');
      console.error('Exception:', JSON.stringify(error, null, 2));
      
      Alert.alert(
        'Помилка',
        `Виняток при збереженні: ${error?.message || 'Невідома помилка'}`
      );
      return false;
    }
  };

  const handleImageSelection = async (pickerResult: ImagePicker.ImagePickerResult) => {
    if (pickerResult.canceled) {
      console.log('HomeScreen (iOS): Image selection cancelled by user');
      return;
    }

    const uri = pickerResult.assets[0].uri;
    console.log('HomeScreen (iOS): ========== STARTING IMAGE UPLOAD PROCESS ==========');
    console.log('HomeScreen (iOS): Selected image URI:', uri);
    console.log('HomeScreen (iOS): 🔍 CRITICAL - selectedLanguage at start of upload:', selectedLanguage);
    
    setUploading(true);

    try {
      console.log('HomeScreen (iOS): Step 1 - Compressing image');
      const compressedBase64 = await compressImage(uri);
      
      if (!compressedBase64) {
        console.error('HomeScreen (iOS): Compression failed');
        Alert.alert('Помилка', 'Не вдалося стиснути зображення.');
        setUploading(false);
        return;
      }

      console.log('HomeScreen (iOS): Step 2 - Uploading to Supabase Storage');
      const imageUrl = await uploadToSupabase(compressedBase64);
      
      if (!imageUrl) {
        console.error('HomeScreen (iOS): Upload to storage failed');
        Alert.alert('Помилка', 'Не вдалося завантажити зображення до сховища.');
        setUploading(false);
        return;
      }

      console.log('HomeScreen (iOS): Step 3 - Saving to database');
      console.log('HomeScreen (iOS): 🔍 CRITICAL - selectedLanguage before saveToDatabase call:', selectedLanguage);
      const saved = await saveToDatabase(imageUrl);
      
      if (!saved) {
        console.error('HomeScreen (iOS): Database save failed');
        setUploading(false);
        return;
      }

      console.log('HomeScreen (iOS): ========== UPLOAD COMPLETE ==========');
      Alert.alert('Успіх', 'Лист успішно завантажено!');
      
      console.log('HomeScreen (iOS): Refreshing scans list');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      console.error('HomeScreen (iOS): ========== UPLOAD PROCESS ERROR ==========');
      console.error('Error:', JSON.stringify(error, null, 2));
      
      Alert.alert(
        'Помилка',
        `Не вдалося завантажити зображення.\n\n${error?.message || 'Невідома помилка'}`
      );
      setUploading(false);
    }
  };

  const scanDocument = async () => {
    console.log('HomeScreen (iOS): User tapped "Сфотографувати лист"');
    console.log('HomeScreen (iOS): 🔍 CRITICAL - selectedLanguage when scan button pressed:', selectedLanguage);
    
    if (scanCount >= FREE_SCAN_LIMIT) {
      console.log('HomeScreen: Free scan limit reached, showing paywall');
      setShowPaywall(true);
      return;
    }
    
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    console.log('HomeScreen (iOS): Launching camera');
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      await handleImageSelection(result);
    } catch (error) {
      console.error('HomeScreen (iOS): Error launching camera:', error);
    }
  };

  const importFromGallery = async () => {
    console.log('HomeScreen (iOS): User tapped "Вибрати з галереї"');
    console.log('HomeScreen (iOS): 🔍 CRITICAL - selectedLanguage when gallery button pressed:', selectedLanguage);
    
    if (scanCount >= FREE_SCAN_LIMIT) {
      console.log('HomeScreen: Free scan limit reached, showing paywall');
      setShowPaywall(true);
      return;
    }
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      await handleImageSelection(result);
    } catch (error) {
      console.error('HomeScreen (iOS): Error launching gallery:', error);
    }
  };

  const viewDocument = (doc: ScannedDocument) => {
    console.log('HomeScreen (iOS): Opening document view for ID:', doc.id);
    console.log('HomeScreen (iOS): Document language:', doc.language || 'null');
    console.log('HomeScreen (iOS): Document has analysis:', !!doc.analysis);
    setSelectedDocument(doc);
    setDetailImageError(false);
  };

  const closeDocumentView = () => {
    console.log('HomeScreen (iOS): Closing document view');
    setSelectedDocument(null);
    setDetailImageError(false);
  };

  const confirmDeleteDocument = (docId: string) => {
    console.log('HomeScreen (iOS): User requested delete for document ID:', docId);
    setDocumentToDelete(docId);
    setShowDeleteModal(true);
  };

  const deleteDocument = async () => {
    if (!documentToDelete) {
      return;
    }

    console.log('HomeScreen (iOS): Deleting document ID:', documentToDelete);
    
    try {
      const { error } = await supabase
        .from('scans')
        .delete()
        .eq('id', documentToDelete);

      if (error) {
        console.error('HomeScreen (iOS): Delete error:', JSON.stringify(error, null, 2));
        Alert.alert('Помилка', 'Не вдалося видалити лист.');
      } else {
        console.log('HomeScreen (iOS): Document deleted successfully');
        await fetchScans();
      }
    } catch (error) {
      console.error('HomeScreen (iOS): Exception deleting document:', error);
    }

    setShowDeleteModal(false);
    setDocumentToDelete(null);
    
    if (selectedDocument && selectedDocument.id === documentToDelete) {
      setSelectedDocument(null);
    }
  };

  const cancelDelete = () => {
    console.log('HomeScreen (iOS): Delete cancelled');
    setShowDeleteModal(false);
    setDocumentToDelete(null);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openSettings = () => {
    console.log('HomeScreen (iOS): User tapped settings button');
    router.push('/settings');
  };

  const emptyStateText = 'Ще немає сканованих листів';
  const emptyStateSubtext = 'Натисніть кнопку нижче, щоб додати перший лист';
  const headerTitle = 'Мій Помічник';
  const scanButtonText = 'Сфотографувати лист';
  const galleryButtonText = 'Вибрати з галереї';
  const uploadingText = 'Завантаження...';
  const documentText = 'Лист';
  const imageDeletedText = 'Фото видалено для безпеки';

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconSymbol
            ios_icon_name="doc.text.fill"
            android_material_icon_name="description"
            size={32}
            color={colors.primary}
          />
          <Text style={styles.headerTitle}>{headerTitle}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={openSettings}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            ios_icon_name="gear"
            android_material_icon_name="settings"
            size={28}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {uploading && (
          <View style={styles.uploadingBanner}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.uploadingText}>{uploadingText}</Text>
          </View>
        )}

        {documents.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="doc.text"
              android_material_icon_name="description"
              size={80}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>{emptyStateText}</Text>
            <Text style={styles.emptyStateSubtext}>{emptyStateSubtext}</Text>
          </View>
        ) : (
          <View style={styles.documentsGrid}>
            {documents.map((doc, index) => {
              const formattedDate = formatDate(doc.created_at);
              const documentName = `${documentText} ${documents.length - index}`;
              const hasImageError = imageLoadErrors[doc.id];
              
              return (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.documentCard}
                  onPress={() => viewDocument(doc)}
                  activeOpacity={0.7}
                >
                  {hasImageError ? (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderIcon}>📄</Text>
                    </View>
                  ) : (
                    <Image 
                      source={{ uri: doc.image_url }} 
                      style={styles.documentThumbnail}
                      onError={() => handleImageError(doc.id)}
                    />
                  )}
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName} numberOfLines={1}>
                      {documentName}
                    </Text>
                    <Text style={styles.documentDate}>{formattedDate}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => confirmDeleteDocument(doc.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={20}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.primaryButton, uploading && styles.disabledButton]} 
          onPress={scanDocument} 
          activeOpacity={0.8}
          disabled={uploading}
        >
          <IconSymbol
            ios_icon_name="camera.fill"
            android_material_icon_name="camera"
            size={24}
            color="#FFFFFF"
          />
          <Text style={styles.primaryButtonText}>{scanButtonText}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.secondaryButton, uploading && styles.disabledButton]} 
          onPress={importFromGallery} 
          activeOpacity={0.8}
          disabled={uploading}
        >
          <IconSymbol
            ios_icon_name="photo"
            android_material_icon_name="image"
            size={24}
            color={colors.primary}
          />
          <Text style={styles.secondaryButtonText}>{galleryButtonText}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 16,
  },
  uploadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 12,
  },
  settingsButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 20,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  documentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  documentCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  documentThumbnail: {
    width: '100%',
    height: 150,
    backgroundColor: colors.background,
  },
  imagePlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: '#E5E5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
  },
  documentInfo: {
    padding: 12,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  documentDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  actionButtons: {
    padding: 20,
    backgroundColor: colors.backgroundAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundAlt,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 8,
  },
});
