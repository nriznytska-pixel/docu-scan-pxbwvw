
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
  Linking,
  Clipboard,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { translate } from '@/constants/translations';
import Constants from 'expo-constants';

interface AnalysisData {
  content: [{ text: string }];
}

interface ActionStep {
  number: number;
  title: string;
  description: string;
  link?: string;
  deadline?: string;
}

interface ParsedAnalysisContent {
  sender?: string;
  type?: string;
  summary_ua: string;
  deadline?: string;
  amount?: number;
  urgency?: 'low' | 'medium' | 'high';
  templates?: string[];
  steps?: ActionStep[];
  bsn_detected?: boolean;
  response_template?: string;
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
  console.log('HomeScreen: Component rendered');
  
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  
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
  const [scanCount, setScanCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'action' | 'response'>('summary');
  const [editableResponse, setEditableResponse] = useState<string>('');
  const FREE_SCAN_LIMIT = 3;
  
  // Custom modal state
  const [customModal, setCustomModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons?: Array<{ text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }>;
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  const showCustomAlert = (
    title: string,
    message: string,
    buttons?: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>
  ) => {
    setCustomModal({
      visible: true,
      title,
      message,
      buttons: buttons || [{ text: 'OK', onPress: () => setCustomModal(prev => ({ ...prev, visible: false })) }],
    });
  };

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
    
    testBackendConnection();
  }, [fetchScans]);

  useEffect(() => {
    if (!user) {
      console.log('HomeScreen: No user, skipping real-time subscription');
      return;
    }

    console.log('HomeScreen: Setting up real-time subscription for user:', user.id);

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
            
            setDocuments((prev) => 
              prev.map((doc) => 
                doc.id === updatedScan.id ? updatedScan : doc
              )
            );
            
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

    return () => {
      console.log('HomeScreen: Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user, selectedDocument, fetchScans]);

  useEffect(() => {
    if (!selectedDocument || selectedDocument.analysis) {
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
          
          setDocuments((prev) =>
            prev.map((doc) => (doc.id === data.id ? data : doc))
          );
        }
      } catch (err) {
        console.error('HomeScreen: Exception while polling:', err);
      }
    }, 5000);

    return () => {
      console.log('HomeScreen: Stopping polling for scan analysis');
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
        showCustomAlert('Помилка', 'Не вдалося відкрити Google Calendar');
      });
  };

  const handleTemplatePress = async (templateType: string, analysis: ParsedAnalysisContent) => {
    console.log('HomeScreen: User tapped template button:', templateType);
    console.log('HomeScreen: Analysis data:', JSON.stringify(analysis, null, 2));
    
    setGeneratingResponse(true);
    
    const webhookUrl = 'https://hook.eu1.make.com/w2ulfcq5936zqn4vwbjd6uy3g90aijuc';
    
    const requestBody = {
      token: 'docuscan_secret_2024',
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
      
      const content = responseData?.data?.content || responseData?.content;
      if (content && content[0]) {
        const responseText = content[0].text;
        console.log('HomeScreen: Extracted response text:', responseText);
        
        setGeneratedResponse(responseText);
        setEditableResponse(responseText);
        setGeneratingResponse(false);
        setShowResponseModal(true);
      } else {
        console.error('HomeScreen: Unexpected response structure');
        showCustomAlert('Помилка', 'Отримано некоректну відповідь від сервера');
        setGeneratingResponse(false);
      }
    } catch (error) {
      console.error('HomeScreen: Error calling webhook:', error);
      showCustomAlert('Помилка', 'Не вдалося згенерувати відповідь. Спробуйте ще раз.');
      setGeneratingResponse(false);
    }
  };

  const generateSampleResponse = async (analysis: ParsedAnalysisContent) => {
    console.log('HomeScreen: User tapped "Sample response letter" button');
    console.log('HomeScreen: Generating sample response for analysis:', JSON.stringify(analysis, null, 2));
    
    if (!selectedDocument) {
      console.error('HomeScreen: No selected document');
      showCustomAlert('Помилка', 'Документ не вибрано');
      return;
    }
    
    console.log('HomeScreen: 🔍 CRITICAL - Using scan UUID:', selectedDocument.id);
    console.log('HomeScreen: 🔍 CRITICAL - Scan ID type:', typeof selectedDocument.id);
    
    setGeneratingResponse(true);
    
    try {
      const { generateResponseLetter } = await import('@/utils/api');
      
      console.log('HomeScreen: 🔍 Calling generateResponseLetter with scanId:', selectedDocument.id);
      const { data, error } = await generateResponseLetter(selectedDocument.id, analysis);
      
      if (error) {
        console.error('HomeScreen: Generate response API error:', error);
        
        // Check if it's an authentication error
        if (error.includes('Authentication')) {
          showCustomAlert(
            'Помилка автентифікації',
            'Будь ласка, увійдіть в систему знову для використання цієї функції.'
          );
        } else {
          showCustomAlert('Помилка', `Не вдалося згенерувати відповідь: ${error}`);
        }
        
        setGeneratingResponse(false);
        return;
      }
      
      if (data && data.response) {
        console.log('HomeScreen: Generated response text:', data.response);
        setGeneratedResponse(data.response);
        setEditableResponse(data.response);
        setGeneratingResponse(false);
        setShowResponseModal(true);
      } else {
        console.error('HomeScreen: No response text in API response');
        showCustomAlert('Помилка', 'Отримано некоректну відповідь від сервера');
        setGeneratingResponse(false);
      }
    } catch (error: any) {
      console.error('HomeScreen: Exception generating sample response:', error);
      showCustomAlert('Помилка', `Не вдалося згенерувати відповідь: ${error?.message || 'Невідома помилка'}`);
      setGeneratingResponse(false);
    }
  };

  const copyToClipboard = () => {
    console.log('HomeScreen: User tapped "Копіювати" button');
    Clipboard.setString(editableResponse);
    const successMessage = translate('letterDetail', 'copiedSuccess', selectedLanguage);
    showCustomAlert('Успіх', successMessage);
  };

  const sendEmail = () => {
    console.log('HomeScreen: User tapped "Надіслати email" button');
    const emailUrl = `mailto:?body=${encodeURIComponent(editableResponse)}`;
    
    Linking.openURL(emailUrl)
      .then(() => {
        console.log('HomeScreen: Successfully opened email app');
      })
      .catch((err) => {
        console.error('HomeScreen: Failed to open email app:', err);
        showCustomAlert('Помилка', 'Не вдалося відкрити додаток електронної пошти');
      });
  };

  const closeResponseModal = () => {
    console.log('HomeScreen: Closing response modal');
    setShowResponseModal(false);
    setGeneratedResponse('');
    setEditableResponse('');
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
      showCustomAlert(
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

      const { data: urlData } = supabase.storage
        .from('letters')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
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
    
    const languageToSave = selectedLanguage || DEFAULT_LANGUAGE;
    console.log('HomeScreen: 🔍 CRITICAL - Language to save:', languageToSave);
    console.log('HomeScreen: 🔍 CRITICAL - Language type:', typeof languageToSave);
    
    if (!user) {
      console.error('HomeScreen: No user logged in, cannot save scan');
      showCustomAlert('Помилка', 'Ви повинні увійти в систему для збереження сканів');
      return false;
    }
    
    console.log('HomeScreen: 🔍 User ID:', user.id);
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      language: languageToSave,
      user_id: user.id,
    };
    
    console.log('HomeScreen: 🔍 CRITICAL - Full data object to insert:', JSON.stringify(dataToInsert, null, 2));
    
    try {
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
        
        showCustomAlert(
          'Помилка збереження',
          `Не вдалося зберегти запис.\n\nПовідомлення: ${insertError.message}\nКод: ${insertError.code || 'N/A'}\n\nПеревірте налаштування таблиці "scans" у Supabase.`
        );
        return false;
      }

      console.log('HomeScreen: ========== INSERT SUCCESS ==========');
      console.log('HomeScreen: 🔍 CRITICAL - Data returned from Supabase:', JSON.stringify(insertData, null, 2));
      
      if (insertData && insertData.length > 0) {
        const savedLanguage = insertData[0].language;
        console.log('HomeScreen: 🔍 CRITICAL - Language saved in database:', savedLanguage);
        if (savedLanguage !== languageToSave) {
          console.error('HomeScreen: ⚠️ WARNING - Language mismatch!');
          console.error(`  Expected: "${languageToSave}"`);
          console.error(`  Got: "${savedLanguage}"`);
        } else {
          console.log('HomeScreen: ✅ Language saved correctly!');
        }
      }
      
      console.log('HomeScreen: Creating scan record in backend API');
      const backendUrl = Constants.expoConfig?.extra?.backendUrl;
      
      if (backendUrl) {
        try {
          console.log('HomeScreen: 🔍 Sending language to backend:', languageToSave);
          const backendResponse = await fetch(`${backendUrl}/scans`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ language: languageToSave }),
          });
          
          if (backendResponse.ok) {
            const backendData = await backendResponse.json();
            console.log('HomeScreen: Backend scan created:', JSON.stringify(backendData, null, 2));
          } else {
            console.error('HomeScreen: Backend API error:', backendResponse.status);
          }
        } catch (backendError: any) {
          console.error('HomeScreen: Backend API exception:', backendError?.message);
        }
      } else {
        console.warn('HomeScreen: Backend URL not configured, skipping backend API call');
      }
      
      return true;
    } catch (error: any) {
      console.error('HomeScreen: ========== EXCEPTION IN SAVE ==========');
      console.error('Exception:', JSON.stringify(error, null, 2));
      
      showCustomAlert(
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
        showCustomAlert('Помилка', 'Не вдалося стиснути зображення.');
        setUploading(false);
        return;
      }

      console.log('HomeScreen: Step 2 - Uploading to Supabase Storage');
      const imageUrl = await uploadToSupabase(compressedBase64);
      
      if (!imageUrl) {
        console.error('HomeScreen: Upload to storage failed');
        showCustomAlert('Помилка', 'Не вдалося завантажити зображення до сховища.');
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
      showCustomAlert('Успіх', 'Лист успішно завантажено!');
      
      console.log('HomeScreen: Refreshing scans list');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      console.error('HomeScreen: ========== UPLOAD PROCESS ERROR ==========');
      console.error('Error:', JSON.stringify(error, null, 2));
      
      showCustomAlert(
        'Помилка',
        `Не вдалося завантажити зображення.\n\n${error?.message || 'Невідома помилка'}`
      );
      setUploading(false);
    }
  };

  const scanDocument = async () => {
    console.log('HomeScreen: User tapped scan button');
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage when scan button pressed:', selectedLanguage);
    
    if (scanCount >= FREE_SCAN_LIMIT) {
      console.log('HomeScreen: Free scan limit reached, showing paywall');
      setShowPaywall(true);
      return;
    }
    
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
    console.log('HomeScreen: User tapped gallery button');
    console.log('HomeScreen: 🔍 CRITICAL - selectedLanguage when gallery button pressed:', selectedLanguage);
    
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
      console.error('HomeScreen: Error launching gallery:', error);
    }
  };

  const viewDocument = (doc: ScannedDocument) => {
    console.log('HomeScreen: User tapped letter card, opening detail view for ID:', doc.id);
    console.log('HomeScreen: Document language:', doc.language || 'null');
    console.log('HomeScreen: Document has analysis:', !!doc.analysis);
    setSelectedDocument(doc);
    setDetailImageError(false);
    setActiveTab('summary');
  };

  const closeDocumentView = () => {
    console.log('HomeScreen: Closing document view');
    setSelectedDocument(null);
    setDetailImageError(false);
    setActiveTab('summary');
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
        showCustomAlert('Помилка', 'Не вдалося видалити лист.');
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

  const handleLogout = async () => {
    console.log('HomeScreen: User tapped logout');
    
    const logoutModalTitle = translate('settings', 'logoutModalTitle', selectedLanguage);
    const logoutModalMessage = translate('settings', 'logoutModalMessage', selectedLanguage);
    const cancelButtonText = translate('settings', 'cancel', selectedLanguage);
    const logoutButtonText = translate('settings', 'logout', selectedLanguage);
    
    showCustomAlert(
      logoutModalTitle,
      logoutModalMessage,
      [
        {
          text: cancelButtonText,
          style: 'cancel',
          onPress: () => console.log('Logout cancelled'),
        },
        {
          text: logoutButtonText,
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              console.error('HomeScreen: Logout error:', error);
              showCustomAlert('Помилка', 'Не вдалося вийти');
            }
          },
        },
      ]
    );
  };

  const calculateDaysRemaining = (deadline: string): number => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const headerTitle = translate('home', 'myLetters', selectedLanguage);
  const emptyStateTitle = translate('home', 'scanFirstLetter', selectedLanguage);
  const emptyStateSubtitle = translate('home', 'takePhoto', selectedLanguage);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      </SafeAreaView>
    );
  }

  const analysis = selectedDocument ? parseAnalysis(selectedDocument.analysis) : null;
  const senderName = analysis?.sender || 'Unknown Sender';
  const letterSubject = analysis?.summary_ua || 'No subject';
  const letterDate = selectedDocument ? formatDate(selectedDocument.created_at) : '';
  const letterReference = selectedDocument?.id.substring(0, 8) || '';
  const bsnDetected = analysis?.bsn_detected || false;
  const deadline = analysis?.deadline;
  const daysRemaining = deadline ? calculateDaysRemaining(deadline) : null;
  const urgency = analysis?.urgency;
  const actionSteps = analysis?.steps || [];
  const responseTemplate = analysis?.response_template || '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <TouchableOpacity
          onPress={handleLogout}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            ios_icon_name="gear"
            android_material_icon_name="settings"
            size={24}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Scan List */}
      {documents.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <IconSymbol
            ios_icon_name="camera"
            android_material_icon_name="camera"
            size={80}
            color={colors.textMuted}
          />
          <Text style={styles.emptyStateTitle}>{emptyStateTitle}</Text>
          <Text style={styles.emptyStateSubtitle}>{emptyStateSubtitle}</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const itemAnalysis = parseAnalysis(item.analysis);
            const itemSenderText = itemAnalysis?.sender || 'Unknown';
            const itemTitleText = itemAnalysis?.summary_ua || 'No title';
            const itemDateText = formatDate(item.created_at);
            const itemDeadlineText = itemAnalysis?.deadline;
            
            return (
              <TouchableOpacity
                style={styles.scanCard}
                onPress={() => viewDocument(item)}
                activeOpacity={0.7}
              >
                <View style={styles.senderBadge}>
                  <View style={styles.greenDot} />
                  <Text style={styles.senderBadgeText}>{itemSenderText}</Text>
                </View>
                <Text style={styles.letterTitle} numberOfLines={2}>
                  {itemTitleText}
                </Text>
                <Text style={styles.dateText}>{itemDateText}</Text>
                {itemDeadlineText && (
                  <View style={styles.deadlineBadge}>
                    <Text style={styles.deadlineBadgeText}>
                      Deadline: {itemDeadlineText}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.scanListContent}
        />
      )}

      {/* Floating Scan Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={scanDocument}
        activeOpacity={0.8}
      >
        <IconSymbol
          ios_icon_name="camera.fill"
          android_material_icon_name="camera"
          size={28}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Analysis Result Modal */}
      <Modal
        visible={!!selectedDocument}
        animationType="slide"
        transparent={false}
        onRequestClose={closeDocumentView}
      >
        <SafeAreaView style={styles.detailContainer} edges={['top']}>
          {/* Top Section */}
          <View style={styles.detailHeader}>
            <TouchableOpacity
              onPress={closeDocumentView}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol
                ios_icon_name="arrow.left"
                android_material_icon_name="arrow-back"
                size={24}
                color="#475569"
              />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailScrollView} contentContainerStyle={styles.detailScrollContent}>
            {/* Sender Badge */}
            <View style={styles.detailSenderBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.detailSenderText}>{senderName}</Text>
            </View>

            {/* Title */}
            <Text style={styles.detailTitle}>{letterSubject}</Text>

            {/* Subtitle */}
            <View style={styles.detailSubtitleRow}>
              <Text style={styles.detailSubtitle}>{letterDate}</Text>
              <Text style={styles.detailSubtitle}> • </Text>
              <Text style={styles.detailSubtitle}>Ref: {letterReference}</Text>
            </View>

            {/* BSN Masked Badge */}
            {bsnDetected && (
              <View style={styles.bsnBadge}>
                <Text style={styles.bsnBadgeText}>🔒 BSN: ●●●● ●● ●●● — masked</Text>
              </View>
            )}

            {/* Urgency Banner */}
            {deadline && (
              <View style={styles.urgencyBanner}>
                <View style={styles.urgencyBannerTop}>
                  <Text style={styles.urgencyBannerIcon}>⚠️</Text>
                  <Text style={styles.urgencyBannerTitle}>Deadline: {deadline}</Text>
                </View>
                {daysRemaining !== null && (
                  <Text style={styles.urgencyBannerSubtext}>
                    {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Deadline passed'}
                  </Text>
                )}
              </View>
            )}

            {/* Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'summary' && styles.tabActive]}
                onPress={() => setActiveTab('summary')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === 'summary' && styles.tabTextActive]}>
                  📋 Summary
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'action' && styles.tabActive]}
                onPress={() => setActiveTab('action')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === 'action' && styles.tabTextActive]}>
                  🎯 Action
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'response' && styles.tabActive]}
                onPress={() => setActiveTab('response')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === 'response' && styles.tabTextActive]}>
                  ✉️ Response
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'summary' && analysis && (
              <View style={styles.tabContent}>
                {/* Summary Card */}
                <View style={styles.summaryCard}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.06)' }]}>
                    <Text style={styles.iconEmoji}>📄</Text>
                  </View>
                  <View style={styles.summaryCardContent}>
                    <Text style={styles.summaryCardText}>{analysis.summary_ua}</Text>
                  </View>
                </View>

                {/* Type Card */}
                {analysis.type && (
                  <View style={styles.summaryCard}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(124,58,237,0.06)' }]}>
                      <Text style={styles.iconEmoji}>📋</Text>
                    </View>
                    <View style={styles.summaryCardContent}>
                      <Text style={styles.summaryCardText}>Type: {analysis.type}</Text>
                      <Text style={styles.summaryCardSubtext}>Document category</Text>
                    </View>
                  </View>
                )}

                {/* Amount Card */}
                {analysis.amount && (
                  <View style={styles.summaryCard}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(16,185,129,0.06)' }]}>
                      <Text style={styles.iconEmoji}>💰</Text>
                    </View>
                    <View style={styles.summaryCardContent}>
                      <Text style={styles.summaryCardText}>Amount: €{analysis.amount}</Text>
                      <Text style={styles.summaryCardSubtext}>Payment or benefit amount</Text>
                    </View>
                  </View>
                )}

                {/* Urgency Card */}
                {urgency && (
                  <View style={styles.summaryCard}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(217,119,6,0.06)' }]}>
                      <Text style={styles.iconEmoji}>⚡</Text>
                    </View>
                    <View style={styles.summaryCardContent}>
                      <Text style={styles.summaryCardText}>
                        Urgency: {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
                      </Text>
                      <Text style={styles.summaryCardSubtext}>Priority level</Text>
                    </View>
                  </View>
                )}

                {/* Tips Card */}
                <View style={styles.summaryCard}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(124,58,237,0.06)' }]}>
                    <Text style={styles.iconEmoji}>💡</Text>
                  </View>
                  <View style={styles.summaryCardContent}>
                    <Text style={styles.summaryCardText}>
                      Need help understanding terms like{' '}
                      <Text style={styles.clickableTerm}>zorgtoeslag</Text> or{' '}
                      <Text style={styles.clickableTerm}>bezwaar</Text>?
                    </Text>
                    <Text style={styles.summaryCardSubtext}>Tap highlighted terms for explanations</Text>
                  </View>
                </View>
              </View>
            )}

            {activeTab === 'action' && (
              <View style={styles.tabContent}>
                {actionSteps.length > 0 ? (
                  <React.Fragment>
                    {actionSteps.map((step, index) => {
                      const stepNumber = step.number || index + 1;
                      const stepTitle = step.title || '';
                      const stepDescription = step.description || '';
                      const stepLink = step.link || '';
                      const stepDeadline = step.deadline || '';
                      
                      return (
                        <View key={index} style={styles.actionStepCard}>
                          <View style={styles.actionStepHeader}>
                            <View style={styles.stepNumberCircle}>
                              <Text style={styles.stepNumberText}>{stepNumber}</Text>
                            </View>
                            <View style={styles.actionStepContent}>
                              <Text style={styles.actionStepTitle}>{stepTitle}</Text>
                              <Text style={styles.actionStepDescription}>{stepDescription}</Text>
                              {stepLink && (
                                <TouchableOpacity
                                  onPress={() => Linking.openURL(stepLink)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.actionStepLink}>{stepLink}</Text>
                                </TouchableOpacity>
                              )}
                              {stepDeadline && (
                                <View style={styles.actionDeadlineBadge}>
                                  <Text style={styles.actionDeadlineText}>Deadline: {stepDeadline}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    {deadline && (
                      <TouchableOpacity
                        style={styles.addToCalendarButton}
                        onPress={() => openGoogleCalendar(senderName, deadline, letterSubject)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addToCalendarText}>📅 Add to calendar</Text>
                      </TouchableOpacity>
                    )}
                  </React.Fragment>
                ) : (
                  <Text style={styles.placeholderText}>No action steps available</Text>
                )}
              </View>
            )}

            {activeTab === 'response' && (
              <View style={styles.tabContent}>
                {responseTemplate ? (
                  <React.Fragment>
                    <View style={styles.letterPreview}>
                      <Text style={styles.letterPreviewText}>{responseTemplate}</Text>
                    </View>
                    <View style={styles.responseButtonsRow}>
                      <TouchableOpacity
                        style={styles.copyButton}
                        onPress={copyToClipboard}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.copyButtonText}>Copy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => {
                          setEditableResponse(responseTemplate);
                          setShowResponseModal(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.disclaimer}>
                      <Text style={styles.disclaimerText}>
                        This is a template. Always review and customize before sending. For legal advice, visit{' '}
                        <Text
                          style={styles.disclaimerLink}
                          onPress={() => Linking.openURL('https://www.juridischloket.nl')}
                        >
                          Juridisch Loket
                        </Text>
                        .
                      </Text>
                    </View>
                  </React.Fragment>
                ) : (
                  <Text style={styles.placeholderText}>No response template available</Text>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Response Edit Modal */}
      <Modal
        visible={showResponseModal}
        animationType="slide"
        transparent={false}
        onRequestClose={closeResponseModal}
      >
        <SafeAreaView style={styles.responseModalContainer} edges={['top']}>
          <View style={styles.responseModalHeader}>
            <TouchableOpacity
              onPress={closeResponseModal}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color="#475569"
              />
            </TouchableOpacity>
            <Text style={styles.responseModalTitle}>Edit Response</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView style={styles.responseModalScroll} contentContainerStyle={styles.responseModalScrollContent}>
            <TextInput
              style={styles.responseTextInput}
              value={editableResponse}
              onChangeText={setEditableResponse}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
          <View style={styles.responseModalButtons}>
            <TouchableOpacity
              style={styles.responseModalCopyButton}
              onPress={copyToClipboard}
              activeOpacity={0.7}
            >
              <Text style={styles.responseModalCopyButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal
        visible={customModal.visible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCustomModal(prev => ({ ...prev, visible: false }))}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>{customModal.title}</Text>
            <Text style={styles.deleteModalMessage}>{customModal.message}</Text>
            <View style={styles.deleteModalButtons}>
              {customModal.buttons && customModal.buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={
                    button.style === 'destructive'
                      ? styles.deleteModalConfirmButton
                      : button.style === 'cancel'
                      ? styles.deleteModalCancelButton
                      : styles.deleteModalCancelButton
                  }
                  onPress={() => {
                    setCustomModal(prev => ({ ...prev, visible: false }));
                    if (button.onPress) button.onPress();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={
                      button.style === 'destructive'
                        ? styles.deleteModalConfirmText
                        : styles.deleteModalCancelText
                    }
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
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
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 20,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  scanListContent: {
    padding: 20,
  },
  scanCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  senderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  senderBadgeText: {
    fontSize: 12,
    color: '#475569',
  },
  letterTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  deadlineBadge: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  deadlineBadgeText: {
    fontSize: 11,
    color: '#DC2626',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  detailHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
  },
  detailScrollView: {
    flex: 1,
  },
  detailScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  detailSenderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  detailSenderText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    lineHeight: 28,
  },
  detailSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
  bsnBadge: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  bsnBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  urgencyBanner: {
    backgroundColor: 'rgba(217,119,6,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.12)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  urgencyBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  urgencyBannerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  urgencyBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D97706',
  },
  urgencyBannerSubtext: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabContent: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconEmoji: {
    fontSize: 18,
  },
  summaryCardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryCardText: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 21.7,
  },
  summaryCardSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  clickableTerm: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
  },
  actionStepCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  actionStepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionStepContent: {
    flex: 1,
  },
  actionStepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  actionStepDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20.15,
  },
  actionStepLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
    marginTop: 8,
  },
  actionDeadlineBadge: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  actionDeadlineText: {
    fontSize: 11,
    color: '#DC2626',
  },
  addToCalendarButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(59,130,246,0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addToCalendarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  letterPreview: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  letterPreviewText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 22.1,
  },
  responseButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  disclaimer: {
    backgroundColor: 'rgba(124,58,237,0.04)',
    borderRadius: 10,
    padding: 12,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 17.6,
  },
  disclaimerLink: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  placeholderText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 40,
  },
  responseModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  responseModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  responseModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  responseModalScroll: {
    flex: 1,
  },
  responseModalScrollContent: {
    padding: 20,
  },
  responseTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 16,
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 22.4,
    minHeight: 400,
  },
  responseModalButtons: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
  responseModalCopyButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  responseModalCopyButtonText: {
    fontSize: 14,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteModalMessage: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22.4,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  deleteModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
  deleteModalConfirmButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  deleteModalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
