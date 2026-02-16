
import React, { useState, useEffect } from 'react';
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
  ActionSheetIOS,
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
import { translate } from '@/constants/translations';
import Constants from 'expo-constants';
import { Swipeable } from 'react-native-gesture-handler';

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
  console.log('HomeScreen (iOS): Component rendered');
  
  const router = useRouter();
  const { selectedLanguage } = useLanguage();
  const { user } = useAuth();
  
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
  const [activeTab, setActiveTab] = useState<'summary' | 'action' | 'response'>('summary');
  const [editableResponse, setEditableResponse] = useState<string>('');
  const FREE_SCAN_LIMIT = 3;

  useEffect(() => {
    console.log('HomeScreen (iOS): Initial load - fetching scans');
    fetchScans();
  }, []);

  useEffect(() => {
    if (!user) {
      console.log('HomeScreen (iOS): No user, skipping real-time subscription');
      return;
    }

    console.log('HomeScreen (iOS): Setting up real-time subscription for user:', user.id);

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
            
            setDocuments((prev) => 
              prev.map((doc) => 
                doc.id === updatedScan.id ? updatedScan : doc
              )
            );
            
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

    return () => {
      console.log('HomeScreen (iOS): Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user, selectedDocument]);

  useEffect(() => {
    if (!selectedDocument || selectedDocument.analysis) {
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
          
          setDocuments((prev) =>
            prev.map((doc) => (doc.id === data.id ? data : doc))
          );
        }
      } catch (err) {
        console.error('HomeScreen (iOS): Exception while polling:', err);
      }
    }, 5000);

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
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Дозвіл потрібен',
          message: 'Будь ласка, надайте доступ до камери для сканування документів.',
          options: ['OK'],
          cancelButtonIndex: 0,
        },
        () => {}
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

      console.log('HomeScreen (iOS): Upload successful, getting public URL');

      const { data: urlData } = supabase.storage
        .from('letters')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      console.log('HomeScreen (iOS): Public URL obtained:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('HomeScreen (iOS): Exception in uploadToSupabase:', error);
      return null;
    }
  };

  const saveToDatabase = async (imageUrl: string): Promise<boolean> => {
    console.log('HomeScreen (iOS): ========== SAVING TO DATABASE ==========');
    console.log('HomeScreen (iOS): Image URL:', imageUrl);
    
    const languageToSave = selectedLanguage || DEFAULT_LANGUAGE;
    console.log('HomeScreen (iOS): 🔍 CRITICAL - Language to save:', languageToSave);
    console.log('HomeScreen (iOS): 🔍 CRITICAL - Language type:', typeof languageToSave);
    
    if (!user) {
      console.error('HomeScreen (iOS): No user logged in, cannot save scan');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Помилка',
          message: 'Ви повинні увійти в систему для збереження сканів',
          options: ['OK'],
          cancelButtonIndex: 0,
        },
        () => {}
      );
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
        
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Помилка збереження',
            message: `Не вдалося зберегти запис.\n\nПовідомлення: ${insertError.message}\nКод: ${insertError.code || 'N/A'}\n\nПеревірте налаштування таблиці "scans" у Supabase.`,
            options: ['OK'],
            cancelButtonIndex: 0,
          },
          () => {}
        );
        return false;
      }

      console.log('HomeScreen (iOS): ========== INSERT SUCCESS ==========');
      console.log('HomeScreen (iOS): 🔍 CRITICAL - Data returned from Supabase:', JSON.stringify(insertData, null, 2));
      
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
        }
      } else {
        console.warn('HomeScreen (iOS): Backend URL not configured, skipping backend API call');
      }
      
      return true;
    } catch (error: any) {
      console.error('HomeScreen (iOS): ========== EXCEPTION IN SAVE ==========');
      console.error('Exception:', JSON.stringify(error, null, 2));
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Помилка',
          message: `Виняток при збереженні: ${error?.message || 'Невідома помилка'}`,
          options: ['OK'],
          cancelButtonIndex: 0,
        },
        () => {}
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
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Помилка',
            message: 'Не вдалося стиснути зображення.',
            options: ['OK'],
            cancelButtonIndex: 0,
          },
          () => {}
        );
        setUploading(false);
        return;
      }

      console.log('HomeScreen (iOS): Step 2 - Uploading to Supabase Storage');
      const imageUrl = await uploadToSupabase(compressedBase64);
      
      if (!imageUrl) {
        console.error('HomeScreen (iOS): Upload to storage failed');
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Помилка',
            message: 'Не вдалося завантажити зображення до сховища.',
            options: ['OK'],
            cancelButtonIndex: 0,
          },
          () => {}
        );
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
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Успіх',
          message: 'Лист успішно завантажено!',
          options: ['OK'],
          cancelButtonIndex: 0,
        },
        () => {}
      );
      
      console.log('HomeScreen (iOS): Refreshing scans list');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      console.error('HomeScreen (iOS): ========== UPLOAD PROCESS ERROR ==========');
      console.error('Error:', JSON.stringify(error, null, 2));
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Помилка',
          message: `Не вдалося завантажити зображення.\n\n${error?.message || 'Невідома помилка'}`,
          options: ['OK'],
          cancelButtonIndex: 0,
        },
        () => {}
      );
      setUploading(false);
    }
  };

  const handleScanButtonPress = () => {
    console.log('HomeScreen (iOS): User tapped scan button - showing ActionSheet');
    
    if (scanCount >= FREE_SCAN_LIMIT) {
      console.log('HomeScreen: Free scan limit reached, showing paywall');
      setShowPaywall(true);
      return;
    }
    
    // Show ActionSheet with two options: Take Photo and Choose from Gallery
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Take Photo', 'Choose from Gallery'],
        cancelButtonIndex: 0,
        title: 'Select Image Source',
        message: 'Choose how you want to add your document',
      },
      (buttonIndex) => {
        if (buttonIndex === 1) {
          console.log('HomeScreen (iOS): User selected "Take Photo"');
          scanDocument();
        } else if (buttonIndex === 2) {
          console.log('HomeScreen (iOS): User selected "Choose from Gallery"');
          importFromGallery();
        }
      }
    );
  };

  const scanDocument = async () => {
    console.log('HomeScreen (iOS): scanDocument called - launching camera');
    console.log('HomeScreen (iOS): 🔍 CRITICAL - selectedLanguage when scan button pressed:', selectedLanguage);
    
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
    console.log('HomeScreen (iOS): importFromGallery called - launching gallery');
    console.log('HomeScreen (iOS): 🔍 CRITICAL - selectedLanguage when gallery button pressed:', selectedLanguage);
    
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
    console.log('HomeScreen (iOS): User tapped letter card, opening detail view for ID:', doc.id);
    console.log('HomeScreen (iOS): Document language:', doc.language || 'null');
    console.log('HomeScreen (iOS): Document has analysis:', !!doc.analysis);
    setSelectedDocument(doc);
    setDetailImageError(false);
    setActiveTab('summary');
  };

  const closeDocumentView = () => {
    console.log('HomeScreen (iOS): Closing document view');
    setSelectedDocument(null);
    setDetailImageError(false);
    setActiveTab('summary');
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
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Помилка',
            message: 'Не вдалося видалити лист.',
            options: ['OK'],
            cancelButtonIndex: 0,
          },
          () => {}
        );
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

  const calculateDaysRemaining = (deadline: string): number => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const openGoogleCalendar = (sender: string, deadline: string, summary: string) => {
    console.log('HomeScreen (iOS): User tapped "Add to calendar" button');
    
    const title = `Deadline: ${sender}`;
    const formattedDate = `${deadline}/${deadline}`;
    
    const encodedTitle = encodeURIComponent(title);
    const encodedDetails = encodeURIComponent(summary);
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${formattedDate}&details=${encodedDetails}`;
    
    Linking.openURL(url)
      .then(() => {
        console.log('HomeScreen (iOS): Successfully opened Google Calendar');
      })
      .catch((err) => {
        console.error('HomeScreen (iOS): Failed to open Google Calendar:', err);
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Error',
            message: 'Failed to open Google Calendar',
            options: ['OK'],
            cancelButtonIndex: 0,
          },
          () => {}
        );
      });
  };

  const copyToClipboard = () => {
    console.log('HomeScreen (iOS): User tapped "Copy" button');
    Clipboard.setString(editableResponse);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Success',
        message: 'Text copied to clipboard',
        options: ['OK'],
        cancelButtonIndex: 0,
      },
      () => {}
    );
  };

  const closeResponseModal = () => {
    console.log('HomeScreen (iOS): Closing response modal');
    setShowResponseModal(false);
    setGeneratedResponse('');
    setEditableResponse('');
  };

  const renderRightActions = (docId: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteSwipeButton}
        onPress={() => confirmDeleteDocument(docId)}
        activeOpacity={0.7}
      >
        <IconSymbol
          ios_icon_name="trash"
          android_material_icon_name="delete"
          size={24}
          color="#FFFFFF"
        />
        <Text style={styles.deleteSwipeButtonText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  const headerTitle = translate('home', 'myLetters', selectedLanguage);
  const emptyStateTitle = translate('home', 'scanFirstLetter', selectedLanguage);
  const emptyStateSubtitle = translate('home', 'takePhoto', selectedLanguage);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  const analysis = selectedDocument ? parseAnalysis(selectedDocument.analysis) : null;
  const senderName = analysis?.sender || 'Unknown Sender';
  const letterSubject = analysis?.summary_ua || 'No subject';
  const letterDate = selectedDocument ? formatDate(selectedDocument.created_at) : '';
  const letterReference = selectedDocument ? String(selectedDocument.id).substring(0, 8) : '';
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
          onPress={openSettings}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            ios_icon_name="gear"
            android_material_icon_name="settings"
            size={24}
            color="#94A3B8"
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
            color="#94A3B8"
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
              <Swipeable
                renderRightActions={() => renderRightActions(item.id)}
                overshootRight={false}
              >
                <TouchableOpacity
                  style={styles.scanCard}
                  onPress={() => viewDocument(item)}
                  onLongPress={() => confirmDeleteDocument(item.id)}
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
              </Swipeable>
            );
          }}
          contentContainerStyle={styles.scanListContent}
        />
      )}

      {/* Floating Scan Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleScanButtonPress}
        activeOpacity={0.8}
      >
        <IconSymbol
          ios_icon_name="camera.fill"
          android_material_icon_name="camera"
          size={28}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Delete Modal */}
      <Modal
        visible={showDeleteModal}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelDelete}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>
              {translate('deleteDialog', 'title', selectedLanguage)}
            </Text>
            <Text style={styles.deleteModalMessage}>
              {translate('deleteDialog', 'message', selectedLanguage)}
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalCancelButton}
                onPress={cancelDelete}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteModalCancelText}>
                  {translate('deleteDialog', 'cancel', selectedLanguage)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteModalConfirmButton}
                onPress={deleteDocument}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteModalConfirmText}>
                  {translate('deleteDialog', 'delete', selectedLanguage)}
                </Text>
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
    backgroundColor: '#F8FAFC',
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
  deleteSwipeButton: {
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    marginBottom: 12,
    borderRadius: 16,
    marginLeft: 8,
  },
  deleteSwipeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
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
