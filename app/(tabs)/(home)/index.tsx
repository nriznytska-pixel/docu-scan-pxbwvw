
import React, { useState, useEffect, useCallback } from 'react';
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

export default function HomeScreen() {
  console.log('HomeScreen: Component rendered');
  
  const router = useRouter();
  const { selectedLanguage } = useLanguage();
  const { user } = useAuth();
  
  // Log the current language whenever component renders
  console.log('HomeScreen: Current selectedLanguage from context:', selectedLanguage);
  
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

  const fetchScans = useCallback(async () => {
    console.log('HomeScreen: fetchScans started');
    
    if (!user) {
      console.log('HomeScreen: No user logged in, skipping fetch');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      console.log('HomeScreen: Fetching scans for user:', user.id);
      
      const { data, error } = await supabase
        .from('scans')
        .select('id, image_url, created_at, analysis, language, user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('HomeScreen: Error fetching scans:', JSON.stringify(error, null, 2));
        return;
      }

      const scansCount = data?.length || 0;
      console.log('HomeScreen: Successfully fetched scans, count:', scansCount);
      
      // Log the language of each scan for debugging
      if (data && data.length > 0) {
        console.log('HomeScreen: Recent scans with languages:');
        data.slice(0, 3).forEach((scan, index) => {
          console.log(`  Scan ${index + 1}: language="${scan.language || 'null'}", user_id="${scan.user_id}", has_analysis=${!!scan.analysis}`);
        });
      }
      
      setDocuments(data || []);
    } catch (error) {
      console.error('HomeScreen: Exception in fetchScans:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    console.log('HomeScreen: Initial load - fetching scans');
    fetchScans();
    
    // Test backend API connection
    testBackendConnection();
  }, [fetchScans]);

  // Set up real-time subscription for scan updates
  useEffect(() => {
    if (!user) {
      console.log('HomeScreen: No user, skipping real-time subscription');
      return;
    }

    console.log('HomeScreen: Setting up real-time subscription for user:', user.id);

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
          console.log('HomeScreen: Real-time update received:', payload);
          
          if (payload.eventType === 'INSERT') {
            console.log('HomeScreen: New scan inserted, refreshing list');
            fetchScans();
          } else if (payload.eventType === 'UPDATE') {
            console.log('HomeScreen: Scan updated:', payload.new);
            const updatedScan = payload.new as ScannedDocument;
            
            // Update the documents list
            setDocuments((prev) => 
              prev.map((doc) => 
                doc.id === updatedScan.id ? updatedScan : doc
              )
            );
            
            // If this is the currently selected document, update it
            if (selectedDocument && selectedDocument.id === updatedScan.id) {
              console.log('HomeScreen: Updating selected document with new analysis');
              setSelectedDocument(updatedScan);
            }
          } else if (payload.eventType === 'DELETE') {
            console.log('HomeScreen: Scan deleted, refreshing list');
            fetchScans();
          }
        }
      )
      .subscribe((status) => {
        console.log('HomeScreen: Subscription status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      console.log('HomeScreen: Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user, selectedDocument, fetchScans]);

  // Poll for updates on the selected document if analysis is pending
  useEffect(() => {
    if (!selectedDocument || selectedDocument.analysis) {
      // No need to poll if no document selected or analysis already exists
      return;
    }

    console.log('HomeScreen: Starting polling for scan analysis:', selectedDocument.id);

    const pollInterval = setInterval(async () => {
      console.log('HomeScreen: Polling for analysis update...');
      
      try {
        const { data, error } = await supabase
          .from('scans')
          .select('*')
          .eq('id', selectedDocument.id)
          .single();

        if (error) {
          console.error('HomeScreen: Error polling for scan:', error);
          return;
        }

        if (data && data.analysis) {
          console.log('HomeScreen: Analysis found! Updating selected document');
          setSelectedDocument(data);
          
          // Also update in the documents list
          setDocuments((prev) =>
            prev.map((doc) => (doc.id === data.id ? data : doc))
          );
        }
      } catch (err) {
        console.error('HomeScreen: Exception while polling:', err);
      }
    }, 5000); // Poll every 5 seconds

    // Cleanup interval on unmount or when analysis arrives
    return () => {
      console.log('HomeScreen: Stopping polling for scan analysis');
      clearInterval(pollInterval);
    };
  }, [selectedDocument]);

  const testBackendConnection = async () => {
    const backendUrl = Constants.expoConfig?.extra?.backendUrl;
    if (!backendUrl) {
      console.warn('HomeScreen: Backend URL not configured');
      return;
    }
    
    try {
      console.log('HomeScreen: Testing backend API connection...');
      const response = await fetch(`${backendUrl}/scans`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('HomeScreen: Backend API is reachable. Scans count:', data?.length || 0);
      } else {
        console.error('HomeScreen: Backend API returned error:', response.status);
      }
    } catch (error: any) {
      console.error('HomeScreen: Backend API connection failed:', error?.message);
    }
  };

  const parseAnalysis = (analysisJson: AnalysisData | undefined): ParsedAnalysisContent | null => {
    console.log('HomeScreen: Parsing analysis data:', JSON.stringify(analysisJson, null, 2));
    
    if (!analysisJson || !analysisJson.content || analysisJson.content.length === 0) {
      console.log('HomeScreen: No analysis data available');
      return null;
    }

    try {
      const textContent = analysisJson.content[0].text;
      console.log('HomeScreen: Raw text content:', textContent);
      
      // Extract JSON from markdown code block (```json ... ```)
      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
      
      let jsonString = textContent;
      if (jsonMatch && jsonMatch[1]) {
        jsonString = jsonMatch[1].trim();
        console.log('HomeScreen: Extracted JSON from markdown wrapper');
      } else {
        console.log('HomeScreen: No markdown wrapper found, parsing as-is');
      }
      
      console.log('HomeScreen: JSON string to parse:', jsonString);
      const parsed = JSON.parse(jsonString);
      console.log('HomeScreen: Successfully parsed analysis:', JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (e) {
      console.error('HomeScreen: Failed to parse analysis JSON:', e);
      return null;
    }
  };

  const generateGoogleCalendarUrl = (sender: string, deadline: string, summary: string): string => {
    console.log('HomeScreen: Generating Google Calendar URL');
    console.log('HomeScreen: Sender:', sender);
    console.log('HomeScreen: Deadline:', deadline);
    console.log('HomeScreen: Summary:', summary);
    
    const title = `Дедлайн: ${sender}`;
    const formattedDate = `${deadline}/${deadline}`;
    
    const encodedTitle = encodeURIComponent(title);
    const encodedDetails = encodeURIComponent(summary);
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${formattedDate}&details=${encodedDetails}`;
    
    console.log('HomeScreen: Generated calendar URL:', url);
    return url;
  };

  const openGoogleCalendar = (sender: string, deadline: string, summary: string) => {
    console.log('HomeScreen: User tapped "Додати в календар" button');
    
    const calendarUrl = generateGoogleCalendarUrl(sender, deadline, summary);
    
    Linking.openURL(calendarUrl)
      .then(() => {
        console.log('HomeScreen: Successfully opened Google Calendar');
      })
      .catch((err) => {
        console.error('HomeScreen: Failed to open Google Calendar:', err);
        Alert.alert('Помилка', 'Не вдалося відкрити Google Calendar');
      });
  };

  const handleTemplatePress = async (templateType: string, analysis: ParsedAnalysisContent) => {
    console.log('HomeScreen: User tapped template button:', templateType);
    console.log('HomeScreen: Analysis data:', JSON.stringify(analysis, null, 2));
    
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
    
    console.log('HomeScreen: Sending webhook request to:', webhookUrl);
    console.log('HomeScreen: Request body:', JSON.stringify(requestBody, null, 2));
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log('HomeScreen: Webhook response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('HomeScreen: Webhook response data:', JSON.stringify(responseData, null, 2));
      
      // Parse response.data.content[0].text
      if (responseData && responseData.data && responseData.data.content && responseData.data.content[0]) {
        const responseText = responseData.data.content[0].text;
        console.log('HomeScreen: Extracted response text:', responseText);
        
        setGeneratedResponse(responseText);
        setGeneratingResponse(false);
        setShowResponseModal(true);
      } else {
        console.error('HomeScreen: Unexpected response structure');
        Alert.alert('Помилка', 'Отримано некоректну відповідь від сервера');
        setGeneratingResponse(false);
      }
    } catch (error) {
      console.error('HomeScreen: Error calling webhook:', error);
      Alert.alert('Помилка', 'Не вдалося згенерувати відповідь. Спробуйте ще раз.');
      setGeneratingResponse(false);
    }
  };

  const copyToClipboard = () => {
    console.log('HomeScreen: User tapped "Копіювати" button');
    Clipboard.setString(generatedResponse);
    Alert.alert('Успіх', 'Текст скопійовано в буфер обміну');
  };

  const sendEmail = () => {
    console.log('HomeScreen: User tapped "Надіслати email" button');
    const emailUrl = `mailto:?body=${encodeURIComponent(generatedResponse)}`;
    
    Linking.openURL(emailUrl)
      .then(() => {
        console.log('HomeScreen: Successfully opened email app');
      })
      .catch((err) => {
        console.error('HomeScreen: Failed to open email app:', err);
        Alert.alert('Помилка', 'Не вдалося відкрити додаток електронної пошти');
      });
  };

  const closeResponseModal = () => {
    console.log('HomeScreen: Closing response modal');
    setShowResponseModal(false);
    setGeneratedResponse('');
  };

  const handleImageError = (docId: string) => {
    console.log('HomeScreen: Image failed to load for document:', docId);
    setImageLoadErrors(prev => ({ ...prev, [docId]: true }));
  };

  const handleDetailImageError = () => {
    console.log('HomeScreen: Detail image failed to load');
    setDetailImageError(true);
  };

  const requestCameraPermission = async () => {
    console.log('HomeScreen: Requesting camera permission');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('HomeScreen: Camera permission denied');
      Alert.alert(
        'Дозвіл потрібен',
        'Будь ласка, надайте доступ до камери для сканування документів.'
      );
      return false;
    }
    
    console.log('HomeScreen: Camera permission granted');
    return true;
  };

  const compressImage = async (uri: string): Promise<string | null> => {
    console.log('HomeScreen: Starting image compression for URI:', uri);
    try {
      let currentCompress = 0.8;
      let compressedImage = await manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
      );

      if (!compressedImage.base64) {
        console.error('HomeScreen: No base64 data from compression');
        return null;
      }

      const MAX_SIZE_BYTES = 1 * 1024 * 1024;
      let currentBase64 = compressedImage.base64;
      let estimatedSize = currentBase64.length * 0.75;

      console.log('HomeScreen: Initial compressed size:', Math.round(estimatedSize), 'bytes');

      while (estimatedSize > MAX_SIZE_BYTES && currentCompress > 0.1) {
        currentCompress -= 0.1;
        console.log('HomeScreen: Recompressing with quality:', currentCompress.toFixed(1));
        
        const reCompressed = await manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }],
          { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
        );
        
        if (reCompressed.base64) {
          currentBase64 = reCompressed.base64;
          estimatedSize = currentBase64.length * 0.75;
          console.log('HomeScreen: New size:', Math.round(estimatedSize), 'bytes');
        } else {
          break;
        }
      }

      const finalSize = Math.round(estimatedSize);
      console.log('HomeScreen: Compression complete, final size:', finalSize, 'bytes');
      return currentBase64;
    } catch (error) {
      console.error('HomeScreen: Error in compressImage:', error);
      return null;
    }
  };

  const uploadToSupabase = async (base64: string): Promise<string | null> => {
    console.log('HomeScreen: Starting Supabase upload');
    try {
      const fileExt = 'jpeg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `public/${fileName}`;

      console.log('HomeScreen: Uploading to bucket "letters", path:', filePath);

      const arrayBuffer = decode(base64);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('letters')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) {
        console.error('HomeScreen: Upload error:', JSON.stringify(uploadError, null, 2));
        return null;
      }

      console.log('HomeScreen: Upload successful, getting public URL');

      const { data: publicUrlData } = supabase.storage
        .from('letters')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      console.log('HomeScreen: Public URL obtained:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('HomeScreen: Exception in uploadToSupabase:', error);
      return null;
    }
  };

  const saveToDatabase = async (imageUrl: string): Promise<boolean> => {
    console.log('HomeScreen: ========== SAVING TO DATABASE ==========');
    console.log('HomeScreen: Image URL:', imageUrl);
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage value at save time:', selectedLanguage);
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage type:', typeof selectedLanguage);
    
    if (!user) {
      console.error('HomeScreen: No user logged in, cannot save scan');
      Alert.alert('Помилка', 'Ви повинні увійти в систему для збереження сканів');
      return false;
    }
    
    console.log('HomeScreen: 🔍 User ID:', user.id);
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      language: selectedLanguage,
      user_id: user.id,
    };
    
    console.log('HomeScreen: 🔍 CRITICAL - Full data object to insert:', JSON.stringify(dataToInsert, null, 2));
    
    try {
      // Save to Supabase (for image storage and analysis)
      const { data: insertData, error: insertError } = await supabase
        .from('scans')
        .insert([dataToInsert])
        .select();

      if (insertError) {
        console.error('HomeScreen: ========== INSERT ERROR ==========');
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

      console.log('HomeScreen: ========== INSERT SUCCESS ==========');
      console.log('HomeScreen: 🔍 CRITICAL - Data returned from Supabase:', JSON.stringify(insertData, null, 2));
      
      // Verify the language was saved correctly
      if (insertData && insertData.length > 0) {
        const savedLanguage = insertData[0].language;
        console.log('HomeScreen: 🔍 CRITICAL - Language saved in database:', savedLanguage);
        if (savedLanguage !== selectedLanguage) {
          console.error('HomeScreen: ⚠️ WARNING - Language mismatch!');
          console.error(`  Expected: "${selectedLanguage}"`);
          console.error(`  Got: "${savedLanguage}"`);
        } else {
          console.log('HomeScreen: ✅ Language saved correctly!');
        }
      }
      
      // Also create a scan record in the backend API with the language
      console.log('HomeScreen: Creating scan record in backend API');
      const backendUrl = Constants.expoConfig?.extra?.backendUrl;
      
      if (backendUrl) {
        try {
          console.log('HomeScreen: 🔍 Sending language to backend:', selectedLanguage);
          const backendResponse = await fetch(`${backendUrl}/scans`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ language: selectedLanguage }),
          });
          
          if (backendResponse.ok) {
            const backendData = await backendResponse.json();
            console.log('HomeScreen: Backend scan created:', JSON.stringify(backendData, null, 2));
          } else {
            console.error('HomeScreen: Backend API error:', backendResponse.status);
          }
        } catch (backendError: any) {
          console.error('HomeScreen: Backend API exception:', backendError?.message);
          // Don't fail the whole operation if backend API fails
        }
      } else {
        console.warn('HomeScreen: Backend URL not configured, skipping backend API call');
      }
      
      return true;
    } catch (error: any) {
      console.error('HomeScreen: ========== EXCEPTION IN SAVE ==========');
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
      console.log('HomeScreen: Image selection cancelled by user');
      return;
    }

    const uri = pickerResult.assets[0].uri;
    console.log('HomeScreen: ========== STARTING IMAGE UPLOAD PROCESS ==========');
    console.log('HomeScreen: Selected image URI:', uri);
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage at start of upload:', selectedLanguage);
    
    setUploading(true);

    try {
      console.log('HomeScreen: Step 1 - Compressing image');
      const compressedBase64 = await compressImage(uri);
      
      if (!compressedBase64) {
        console.error('HomeScreen: Compression failed');
        Alert.alert('Помилка', 'Не вдалося стиснути зображення.');
        setUploading(false);
        return;
      }

      console.log('HomeScreen: Step 2 - Uploading to Supabase Storage');
      const imageUrl = await uploadToSupabase(compressedBase64);
      
      if (!imageUrl) {
        console.error('HomeScreen: Upload to storage failed');
        Alert.alert('Помилка', 'Не вдалося завантажити зображення до сховища.');
        setUploading(false);
        return;
      }

      console.log('HomeScreen: Step 3 - Saving to database');
      console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage before saveToDatabase call:', selectedLanguage);
      const saved = await saveToDatabase(imageUrl);
      
      if (!saved) {
        console.error('HomeScreen: Database save failed');
        setUploading(false);
        return;
      }

      console.log('HomeScreen: ========== UPLOAD COMPLETE ==========');
      Alert.alert('Успіх', 'Лист успішно завантажено!');
      
      console.log('HomeScreen: Refreshing scans list');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      console.error('HomeScreen: ========== UPLOAD PROCESS ERROR ==========');
      console.error('Error:', JSON.stringify(error, null, 2));
      
      Alert.alert(
        'Помилка',
        `Не вдалося завантажити зображення.\n\n${error?.message || 'Невідома помилка'}`
      );
      setUploading(false);
    }
  };

  const scanDocument = async () => {
    console.log('HomeScreen: User tapped "Сфотографувати лист"');
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage when scan button pressed:', selectedLanguage);
    
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    console.log('HomeScreen: Launching camera');
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      await handleImageSelection(result);
    } catch (error) {
      console.error('HomeScreen: Error launching camera:', error);
    }
  };

  const importFromGallery = async () => {
    console.log('HomeScreen: User tapped "Вибрати з галереї"');
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage when gallery button pressed:', selectedLanguage);
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      await handleImageSelection(result);
    } catch (error) {
      console.error('HomeScreen: Error launching gallery:', error);
    }
  };

  const viewDocument = (doc: ScannedDocument) => {
    console.log('HomeScreen: Opening document view for ID:', doc.id);
    console.log('HomeScreen: Document language:', doc.language || 'null');
    console.log('HomeScreen: Document has analysis:', !!doc.analysis);
    setSelectedDocument(doc);
    setDetailImageError(false);
  };

  const closeDocumentView = () => {
    console.log('HomeScreen: Closing document view');
    setSelectedDocument(null);
    setDetailImageError(false);
  };

  const confirmDeleteDocument = (docId: string) => {
    console.log('HomeScreen: User requested delete for document ID:', docId);
    setDocumentToDelete(docId);
    setShowDeleteModal(true);
  };

  const deleteDocument = async () => {
    if (!documentToDelete) {
      return;
    }

    console.log('HomeScreen: Deleting document ID:', documentToDelete);
    
    try {
      const { error } = await supabase
        .from('scans')
        .delete()
        .eq('id', documentToDelete);

      if (error) {
        console.error('HomeScreen: Delete error:', JSON.stringify(error, null, 2));
        Alert.alert('Помилка', 'Не вдалося видалити лист.');
      } else {
        console.log('HomeScreen: Document deleted successfully');
        await fetchScans();
      }
    } catch (error) {
      console.error('HomeScreen: Exception deleting document:', error);
    }

    setShowDeleteModal(false);
    setDocumentToDelete(null);
    
    if (selectedDocument && selectedDocument.id === documentToDelete) {
      setSelectedDocument(null);
    }
  };

  const cancelDelete = () => {
    console.log('HomeScreen: Delete cancelled');
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
    console.log('HomeScreen: User tapped settings button');
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

      <Modal
        visible={selectedDocument !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={closeDocumentView}
      >
        {selectedDocument && (() => {
          const analysis = parseAnalysis(selectedDocument.analysis);
          const analyzingText = '⏳ Аналізується...';
          const urgencyWarning = '⚠️ Терміново!';
          const deadlineLabel = '📅 Дедлайн:';
          const amountLabel = '💶 Сума:';
          const calendarButtonText = '📅 Додати в календар';
          const stepsTitle = '📋 Що робити:';
          const replyButtonText = '✍️ Відповісти';
          
          return (
            <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={closeDocumentView} style={styles.closeButton}>
                  <IconSymbol
                    ios_icon_name="xmark"
                    android_material_icon_name="close"
                    size={24}
                    color={colors.text}
                  />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Перегляд листа</Text>
                <View style={styles.placeholder} />
              </View>
              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
              >
                {detailImageError ? (
                  <View style={styles.detailImagePlaceholder}>
                    <Text style={styles.detailPlaceholderIcon}>📄</Text>
                    <Text style={styles.detailPlaceholderText}>{imageDeletedText}</Text>
                  </View>
                ) : (
                  <Image 
                    source={{ uri: selectedDocument.image_url }} 
                    style={styles.fullImage} 
                    resizeMode="contain"
                    onError={handleDetailImageError}
                  />
                )}
                
                {!selectedDocument.analysis && (
                  <View style={styles.analysisContainer}>
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 12 }} />
                    <Text style={styles.analyzingText}>{analyzingText}</Text>
                  </View>
                )}
                
                {selectedDocument.analysis && !analysis && (
                  <View style={styles.analysisContainer}>
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 12 }} />
                    <Text style={styles.analyzingText}>{analyzingText}</Text>
                  </View>
                )}
                
                {analysis && (
                  <View style={styles.analysisContainer}>
                    {analysis.urgency === 'high' && (
                      <View style={styles.warningBanner}>
                        <Text style={styles.warningText}>{urgencyWarning}</Text>
                      </View>
                    )}
                    
                    <Text style={styles.summaryText}>{analysis.summary_ua}</Text>
                    
                    {analysis.deadline && (
                      <View style={styles.deadlineContainer}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>{deadlineLabel}</Text>
                          <Text style={styles.detailValue}>{analysis.deadline}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.calendarButton}
                          onPress={() => openGoogleCalendar(
                            analysis.sender || 'Невідомий відправник',
                            analysis.deadline!,
                            analysis.summary_ua || ''
                          )}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.calendarButtonText}>{calendarButtonText}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {analysis.amount !== undefined && analysis.amount !== null && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{amountLabel}</Text>
                        <Text style={styles.detailValue}>{analysis.amount}</Text>
                      </View>
                    )}
                    
                    {analysis.templates && analysis.templates.length > 0 && (
                      <View style={styles.templatesContainer}>
                        {analysis.templates.map((template, index) => {
                          const templateLabel = TEMPLATE_LABELS[template] || template;
                          return (
                            <TouchableOpacity 
                              key={index} 
                              style={styles.templateButton}
                              onPress={() => handleTemplatePress(template, analysis)}
                              disabled={generatingResponse}
                            >
                              <Text style={styles.templateButtonText}>{templateLabel}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    
                    {analysis.steps && analysis.steps.length > 0 && (
                      <View style={styles.stepsCard}>
                        <Text style={styles.stepsTitle}>{stepsTitle}</Text>
                        <View style={styles.stepsList}>
                          {analysis.steps.map((step, index) => {
                            const stepNumber = `${index + 1}.`;
                            const checkboxIcon = '☐';
                            return (
                              <View key={index} style={styles.stepItem}>
                                <Text style={styles.stepNumber}>{stepNumber}</Text>
                                <Text style={styles.stepCheckbox}>{checkboxIcon}</Text>
                                <Text style={styles.stepText}>{step}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                    
                    <View style={styles.replyButtonContainer}>
                      <TouchableOpacity 
                        style={styles.replyButton}
                        onPress={() => handleTemplatePress('reply', analysis)}
                        disabled={generatingResponse}
                      >
                        <Text style={styles.replyButtonText}>{replyButtonText}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>
            </SafeAreaView>
          );
        })()}
      </Modal>

      <Modal
        visible={generatingResponse}
        animationType="fade"
        transparent={true}
      >
        <View style={styles.loadingModalOverlay}>
          <View style={styles.loadingModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingModalText}>Генерую відповідь...</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showResponseModal}
        animationType="fade"
        transparent={false}
        onRequestClose={closeResponseModal}
      >
        <SafeAreaView style={styles.responseModalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeResponseModal} style={styles.closeButton}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Згенерована відповідь</Text>
            <View style={styles.placeholder} />
          </View>
          <ScrollView style={styles.responseScrollView} contentContainerStyle={styles.responseScrollContent}>
            <Text style={styles.responseText}>{generatedResponse}</Text>
          </ScrollView>
          <View style={styles.responseActions}>
            <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>📋 Копіювати</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emailButton} onPress={sendEmail}>
              <Text style={styles.emailButtonText}>✉️ Надіслати email</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showDeleteModal}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelDelete}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>Видалити лист?</Text>
            <Text style={styles.deleteModalMessage}>
              Цю дію не можна скасувати.
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelDelete}>
                <Text style={styles.cancelButtonText}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteButton} onPress={deleteDocument}>
                <Text style={styles.confirmDeleteButtonText}>Видалити</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? 48 : 0,
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
    elevation: 2,
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
    elevation: 2,
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
    elevation: 2,
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
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  fullImage: {
    width: '100%',
    height: 400,
    backgroundColor: colors.background,
  },
  detailImagePlaceholder: {
    width: '100%',
    height: 400,
    backgroundColor: '#E5E5E5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  detailPlaceholderIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  detailPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  analysisContainer: {
    padding: 20,
    backgroundColor: colors.backgroundAlt,
  },
  analyzingText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  warningBanner: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 16,
  },
  deadlineContainer: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  detailValue: {
    fontSize: 16,
    color: colors.text,
  },
  calendarButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  calendarButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  templatesContainer: {
    marginTop: 16,
    gap: 12,
  },
  templateButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  templateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stepsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  stepsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  stepsList: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
    minWidth: 24,
  },
  stepCheckbox: {
    fontSize: 16,
    color: colors.text,
    marginRight: 8,
  },
  stepText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
    lineHeight: 22,
  },
  replyButtonContainer: {
    marginTop: 16,
  },
  replyButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  replyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModalContent: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 200,
  },
  loadingModalText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  responseModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  responseScrollView: {
    flex: 1,
  },
  responseScrollContent: {
    padding: 20,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  responseActions: {
    padding: 20,
    backgroundColor: colors.backgroundAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  copyButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emailButton: {
    backgroundColor: '#34C759',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteModalMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  confirmDeleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
