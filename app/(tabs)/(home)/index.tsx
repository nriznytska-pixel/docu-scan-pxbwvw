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
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

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
  
  const router = useRouter();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  
  console.log('HomeScreen: Current selectedLanguage from context:', selectedLanguage);
  
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
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
  const [showScanOptionsModal, setShowScanOptionsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
    if (!analysisJson || !analysisJson.content || analysisJson.content.length === 0) {
      return null;
    }

    try {
      const textContent = analysisJson.content[0].text;
      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
      
      let jsonString = textContent;
      if (jsonMatch && jsonMatch[1]) {
        jsonString = jsonMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonString);
      return parsed;
    } catch (e) {
      console.error('HomeScreen: Failed to parse analysis JSON:', e);
      return null;
    }
  };

  const generateGoogleCalendarUrl = (sender: string, deadline: string, summary: string): string => {
    const title = `Дедлайн: ${sender}`;
    const formattedDate = `${deadline}/${deadline}`;
    const encodedTitle = encodeURIComponent(title);
    const encodedDetails = encodeURIComponent(summary);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${formattedDate}&details=${encodedDetails}`;
  };

  const openGoogleCalendar = (sender: string, deadline: string, summary: string) => {
    const calendarUrl = generateGoogleCalendarUrl(sender, deadline, summary);
    Linking.openURL(calendarUrl).catch((err) => {
      console.error('HomeScreen: Failed to open Google Calendar:', err);
      showCustomAlert('Помилка', 'Не вдалося відкрити Google Calendar');
    });
  };

  const handleTemplatePress = async (templateType: string, analysis: ParsedAnalysisContent) => {
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
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const responseData = await response.json();
      const content = responseData?.data?.content || responseData?.content;
      if (content && content[0]) {
        setGeneratedResponse(content[0].text);
        setEditableResponse(content[0].text);
        setGeneratingResponse(false);
        setShowResponseModal(true);
      } else {
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
    if (!selectedDocument) {
      showCustomAlert('Помилка', 'Документ не вибрано');
      return;
    }
    
    setGeneratingResponse(true);
    
    try {
      const { generateResponseLetter } = await import('@/utils/api');
      const { data, error } = await generateResponseLetter(selectedDocument.id, analysis);
      
      if (error) {
        if (error.includes('Authentication')) {
          showCustomAlert('Помилка автентифікації', 'Будь ласка, увійдіть в систему знову.');
        } else {
          showCustomAlert('Помилка', `Не вдалося згенерувати відповідь: ${error}`);
        }
        setGeneratingResponse(false);
        return;
      }
      
      if (data && data.response) {
        setGeneratedResponse(data.response);
        setEditableResponse(data.response);
        setGeneratingResponse(false);
        setShowResponseModal(true);
      } else {
        showCustomAlert('Помилка', 'Отримано некоректну відповідь від сервера');
        setGeneratingResponse(false);
      }
    } catch (error: any) {
      showCustomAlert('Помилка', `Не вдалося згенерувати відповідь: ${error?.message || 'Невідома помилка'}`);
      setGeneratingResponse(false);
    }
  };

  const copyToClipboard = () => {
    Clipboard.setString(editableResponse);
    const successMessage = translate('letterDetail', 'copiedSuccess', selectedLanguage);
    showCustomAlert('Успіх', successMessage);
  };

  const sendEmail = () => {
    const emailUrl = `mailto:?body=${encodeURIComponent(editableResponse)}`;
    Linking.openURL(emailUrl).catch((err) => {
      showCustomAlert('Помилка', 'Не вдалося відкрити додаток електронної пошти');
    });
  };

  const closeResponseModal = () => {
    setShowResponseModal(false);
    setGeneratedResponse('');
    setEditableResponse('');
  };

  const handleImageError = (docId: string) => {
    setImageLoadErrors(prev => ({ ...prev, [docId]: true }));
  };

  const handleDetailImageError = () => {
    setDetailImageError(true);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showCustomAlert('Дозвіл потрібен', 'Будь ласка, надайте доступ до камери для сканування документів.');
      return false;
    }
    return true;
  };

  const compressImage = async (uri: string): Promise<string | null> => {
    try {
      let currentCompress = 0.8;
      let compressedImage = await manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
      );

      if (!compressedImage.base64) return null;

      const MAX_SIZE_BYTES = 1 * 1024 * 1024;
      let currentBase64 = compressedImage.base64;
      let estimatedSize = currentBase64.length * 0.75;

      while (estimatedSize > MAX_SIZE_BYTES && currentCompress > 0.1) {
        currentCompress -= 0.1;
        const reCompressed = await manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }],
          { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
        );
        if (reCompressed.base64) {
          currentBase64 = reCompressed.base64;
          estimatedSize = currentBase64.length * 0.75;
        } else {
          break;
        }
      }

      return currentBase64;
    } catch (error) {
      console.error('HomeScreen: Error in compressImage:', error);
      return null;
    }
  };

  const uploadToSupabase = async (base64: string): Promise<string | null> => {
    try {
      const fileExt = 'jpeg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `public/${fileName}`;
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

      const { data: urlData } = supabase.storage.from('letters').getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch (error) {
      console.error('HomeScreen: Exception in uploadToSupabase:', error);
      return null;
    }
  };

  const saveToDatabase = async (imageUrl: string): Promise<boolean> => {
    const languageToSave = selectedLanguage || DEFAULT_LANGUAGE;
    
    if (!user) {
      showCustomAlert('Помилка', 'Ви повинні увійти в систему для збереження сканів');
      return false;
    }
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      language: languageToSave,
      user_id: user.id,
    };
    
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('scans')
        .insert([dataToInsert])
        .select();

      if (insertError) {
        showCustomAlert(
          'Помилка збереження',
          `Не вдалося зберегти запис.\n\nПовідомлення: ${insertError.message}\nКод: ${insertError.code || 'N/A'}`
        );
        return false;
      }

      const backendUrl = Constants.expoConfig?.extra?.backendUrl;
      if (backendUrl) {
        try {
          await fetch(`${backendUrl}/scans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: languageToSave }),
          });
        } catch (backendError: any) {
          console.error('HomeScreen: Backend API exception:', backendError?.message);
        }
      }
      
      return true;
    } catch (error: any) {
      showCustomAlert('Помилка', `Виняток при збереженні: ${error?.message || 'Невідома помилка'}`);
      return false;
    }
  };

  const handleImageSelection = async (pickerResult: ImagePicker.ImagePickerResult) => {
    if (pickerResult.canceled) return;

    const uri = pickerResult.assets[0].uri;
    setUploading(true);

    try {
      const compressedBase64 = await compressImage(uri);
      if (!compressedBase64) {
        showCustomAlert('Помилка', 'Не вдалося стиснути зображення.');
        setUploading(false);
        return;
      }

      const imageUrl = await uploadToSupabase(compressedBase64);
      if (!imageUrl) {
        showCustomAlert('Помилка', 'Не вдалося завантажити зображення до сховища.');
        setUploading(false);
        return;
      }

      const saved = await saveToDatabase(imageUrl);
      if (!saved) {
        setUploading(false);
        return;
      }

      showCustomAlert('Успіх', 'Лист успішно завантажено!');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      showCustomAlert('Помилка', `Не вдалося завантажити зображення.\n\n${error?.message || 'Невідома помилка'}`);
      setUploading(false);
    }
  };

  const scanDocument = async () => {
    setShowScanOptionsModal(false);
    
    if (scanCount >= FREE_SCAN_LIMIT) {
      setShowPaywall(true);
      return;
    }
    
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

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
    setShowScanOptionsModal(false);
    
    if (scanCount >= FREE_SCAN_LIMIT) {
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
    setSelectedDocument(doc);
    setDetailImageError(false);
    setActiveTab('summary');
  };

  const closeDocumentView = () => {
    setSelectedDocument(null);
    setDetailImageError(false);
    setActiveTab('summary');
  };

  const confirmDeleteDocument = (docId: string) => {
    showCustomAlert(
      'Delete letter?',
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('scans').delete().eq('id', docId);
              if (error) {
                showCustomAlert('Помилка', 'Не вдалося видалити лист.');
              } else {
                await fetchScans();
                if (selectedDocument && selectedDocument.id === docId) {
                  setSelectedDocument(null);
                }
              }
            } catch (error) {
              console.error('HomeScreen: Exception deleting document:', error);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleSettingsPress = () => {
    console.log('HomeScreen: User tapped settings button');
    setShowSettingsModal(true);
  };

  const handleLanguageChange = (lang: string) => {
    console.log('HomeScreen: User changed language to:', lang);
    setSelectedLanguage(lang);
  };

  const handleSignOut = async () => {
    console.log('HomeScreen: User tapped sign out');
    setShowSettingsModal(false);
    await signOut();
  };

  const LANGUAGES = [
    { code: 'uk', label: 'Українська', flag: '🇺🇦' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', label: 'Polski', flag: '🇵🇱' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  ];

  const calculateDaysRemaining = (deadline: string): number => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffTime = deadlineDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const renderRightActions = (docId: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteSwipeButton}
        onPress={() => confirmDeleteDocument(docId)}
        activeOpacity={0.7}
      >
        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={24} color="#FFFFFF" />
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
          <ActivityIndicator size="large" color={colors.accentBlue} />
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
        <TouchableOpacity
          onPress={() => {
            showCustomAlert(
              'Sign Out?',
              'Are you sure you want to sign out?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
              ]
            );
          }}
          style={styles.headerBackButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol ios_icon_name="arrow.left" android_material_icon_name="arrow-back" size={22} color="#475569" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <TouchableOpacity
          onPress={handleSettingsPress}
          style={styles.headerGearButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol ios_icon_name="gear" android_material_icon_name="settings" size={22} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* Scan List */}
      {documents.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <IconSymbol ios_icon_name="camera" android_material_icon_name="camera" size={80} color={colors.textMuted} />
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
                  activeOpacity={0.7}
                >
                  {/* Visible delete button (works on desktop too) */}
                  <TouchableOpacity
                    style={styles.cardDeleteButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      confirmDeleteDocument(item.id);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.cardDeleteIcon}>✕</Text>
                  </TouchableOpacity>

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

      {/* Floating Scan Button — opens scan options */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowScanOptionsModal(true)}
        activeOpacity={0.8}
      >
        <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ====== SCAN OPTIONS MODAL ====== */}
      <Modal
        visible={showScanOptionsModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowScanOptionsModal(false)}
      >
        <TouchableOpacity
          style={styles.scanOptionsOverlay}
          activeOpacity={1}
          onPress={() => setShowScanOptionsModal(false)}
        >
          <View style={styles.scanOptionsSheet}>
            <Text style={styles.scanOptionsTitle}>Add a letter</Text>
            
            <TouchableOpacity style={styles.scanOptionButton} onPress={scanDocument} activeOpacity={0.7}>
              <View style={[styles.scanOptionIcon, { backgroundColor: 'rgba(59,130,246,0.08)' }]}>
                <Text style={{ fontSize: 22 }}>📷</Text>
              </View>
              <View style={styles.scanOptionTextContainer}>
                <Text style={styles.scanOptionLabel}>Take Photo</Text>
                <Text style={styles.scanOptionDescription}>Use camera to scan a letter</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.scanOptionButton} onPress={importFromGallery} activeOpacity={0.7}>
              <View style={[styles.scanOptionIcon, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                <Text style={{ fontSize: 22 }}>🖼️</Text>
              </View>
              <View style={styles.scanOptionTextContainer}>
                <Text style={styles.scanOptionLabel}>Choose from Gallery</Text>
                <Text style={styles.scanOptionDescription}>Select an existing photo</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.scanOptionCancelButton}
              onPress={() => setShowScanOptionsModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.scanOptionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ====== ANALYSIS RESULT MODAL ====== */}
      <Modal
        visible={!!selectedDocument}
        animationType="slide"
        transparent={false}
        onRequestClose={closeDocumentView}
      >
        <SafeAreaView style={styles.detailContainer} edges={['top']}>
          <View style={styles.detailHeader}>
            <TouchableOpacity
              onPress={closeDocumentView}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol ios_icon_name="arrow.left" android_material_icon_name="arrow-back" size={28} color="#475569" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerSenderName}>{senderName}</Text>
              <View style={styles.headerSubtitleRow}>
                <Text style={styles.headerSubtitle}>{letterDate}</Text>
                <Text style={styles.headerSubtitle}> • </Text>
                <Text style={styles.headerSubtitle}>Ref: {letterReference}</Text>
              </View>
            </View>
          </View>

          <ScrollView style={styles.detailScrollView} contentContainerStyle={styles.detailScrollContent}>
            {bsnDetected && (
              <View style={styles.bsnBadge}>
                <Text style={styles.bsnBadgeText}>🔒 BSN: ●●●● ●● ●●● — masked</Text>
              </View>
            )}

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

            <View style={styles.tabBar}>
              <TouchableOpacity style={[styles.tab, activeTab === 'summary' && styles.tabActive]} onPress={() => setActiveTab('summary')} activeOpacity={0.7}>
                <Text style={[styles.tabText, activeTab === 'summary' && styles.tabTextActive]}>📋 Summary</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'action' && styles.tabActive]} onPress={() => setActiveTab('action')} activeOpacity={0.7}>
                <Text style={[styles.tabText, activeTab === 'action' && styles.tabTextActive]}>🎯 Action</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'response' && styles.tabActive]} onPress={() => setActiveTab('response')} activeOpacity={0.7}>
                <Text style={[styles.tabText, activeTab === 'response' && styles.tabTextActive]}>✉️ Response</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'summary' && analysis && (
              <View style={styles.tabContent}>
                <View style={styles.summaryCard}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.06)' }]}>
                    <Text style={styles.iconEmoji}>📄</Text>
                  </View>
                  <View style={styles.summaryCardContent}>
                    <Text style={styles.summaryCardText}>{analysis.summary_ua}</Text>
                  </View>
                </View>

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

                {urgency && (
                  <View style={styles.summaryCard}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(217,119,6,0.06)' }]}>
                      <Text style={styles.iconEmoji}>⚡</Text>
                    </View>
                    <View style={styles.summaryCardContent}>
                      <Text style={styles.summaryCardText}>Urgency: {urgency.charAt(0).toUpperCase() + urgency.slice(1)}</Text>
                      <Text style={styles.summaryCardSubtext}>Priority level</Text>
                    </View>
                  </View>
                )}

              </View>
            )}

            {activeTab === 'action' && (
              <View style={styles.tabContent}>
                {actionSteps.length > 0 ? (
                  <React.Fragment>
                    {actionSteps.map((step, index) => (
                      <View key={index} style={styles.actionStepCard}>
                        <View style={styles.actionStepHeader}>
                          <View style={styles.stepNumberCircle}>
                            <Text style={styles.stepNumberText}>{step.number || index + 1}</Text>
                          </View>
                          <View style={styles.actionStepContent}>
                            <Text style={styles.actionStepTitle}>{step.title || ''}</Text>
                            <Text style={styles.actionStepDescription}>{step.description || ''}</Text>
                            {step.link ? (
                              <TouchableOpacity onPress={() => Linking.openURL(step.link!)} activeOpacity={0.7}>
                                <Text style={styles.actionStepLink}>{step.link}</Text>
                              </TouchableOpacity>
                            ) : null}
                            {step.deadline ? (
                              <View style={styles.actionDeadlineBadge}>
                                <Text style={styles.actionDeadlineText}>Deadline: {step.deadline}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    ))}
                    {deadline && (
                      <TouchableOpacity style={styles.addToCalendarButton} onPress={() => openGoogleCalendar(senderName, deadline, letterSubject)} activeOpacity={0.7}>
                        <Text style={styles.addToCalendarText}>📅 Add to calendar</Text>
                      </TouchableOpacity>
                    )}
                  </React.Fragment>
                ) : analysis ? (
                  <React.Fragment>
                    {/* Auto-generated basic steps from analysis data */}
                    <View style={styles.actionStepCard}>
                      <View style={styles.actionStepHeader}>
                        <View style={styles.stepNumberCircle}>
                          <Text style={styles.stepNumberText}>1</Text>
                        </View>
                        <View style={styles.actionStepContent}>
                          <Text style={styles.actionStepTitle}>Read and understand</Text>
                          <Text style={styles.actionStepDescription}>
                            Review the letter from {analysis.sender || 'the sender'}. See the Summary tab for a full explanation.
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    {analysis.deadline && (
                      <View style={styles.actionStepCard}>
                        <View style={styles.actionStepHeader}>
                          <View style={[styles.stepNumberCircle, { backgroundColor: '#DC2626' }]}>
                            <Text style={styles.stepNumberText}>2</Text>
                          </View>
                          <View style={styles.actionStepContent}>
                            <Text style={styles.actionStepTitle}>Check the deadline</Text>
                            <Text style={styles.actionStepDescription}>
                              This letter has a deadline: {analysis.deadline}. Make sure to act before this date.
                            </Text>
                            <View style={styles.actionDeadlineBadge}>
                              <Text style={styles.actionDeadlineText}>⚠️ Deadline: {analysis.deadline}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    )}

                    <View style={styles.actionStepCard}>
                      <View style={styles.actionStepHeader}>
                        <View style={[styles.stepNumberCircle, { backgroundColor: '#10B981' }]}>
                          <Text style={styles.stepNumberText}>{analysis.deadline ? '3' : '2'}</Text>
                        </View>
                        <View style={styles.actionStepContent}>
                          <Text style={styles.actionStepTitle}>Respond if needed</Text>
                          <Text style={styles.actionStepDescription}>
                            Go to the Response tab to generate a sample reply letter in Dutch.
                          </Text>
                        </View>
                      </View>
                    </View>

                    {deadline && (
                      <TouchableOpacity style={styles.addToCalendarButton} onPress={() => openGoogleCalendar(senderName, deadline, letterSubject)} activeOpacity={0.7}>
                        <Text style={styles.addToCalendarText}>📅 Add deadline to calendar</Text>
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
                      <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard} activeOpacity={0.7}>
                        <Text style={styles.copyButtonText}>Copy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.editButton} onPress={() => { setEditableResponse(responseTemplate); setShowResponseModal(true); }} activeOpacity={0.7}>
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.disclaimer}>
                      <Text style={styles.disclaimerText}>
                        This is a template. Always review and customize before sending. For legal advice, visit{' '}
                        <Text style={styles.disclaimerLink} onPress={() => Linking.openURL('https://www.juridischloket.nl')}>Juridisch Loket</Text>.
                      </Text>
                    </View>
                  </React.Fragment>
                ) : (
                  <View style={styles.generateContainer}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.06)', width: 56, height: 56, borderRadius: 16, marginBottom: 12 }]}>
                      <Text style={{ fontSize: 28 }}>✉️</Text>
                    </View>
                    <Text style={styles.generateTitle}>Response letter</Text>
                    <Text style={styles.generateDescription}>
                      Generate a sample response letter in correct Dutch, ready to customize and send.
                    </Text>
                    <TouchableOpacity
                      style={styles.generateButton}
                      onPress={() => analysis && generateSampleResponse(analysis)}
                      activeOpacity={0.7}
                      disabled={generatingResponse || !analysis}
                    >
                      {generatingResponse ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.generateButtonText}>Generate Response Letter</Text>
                      )}
                    </TouchableOpacity>
                    <View style={[styles.disclaimer, { marginTop: 12 }]}>
                      <Text style={styles.disclaimerText}>
                        Generated letters are examples only, not legal advice. Visit{' '}
                        <Text style={styles.disclaimerLink} onPress={() => Linking.openURL('https://www.juridischloket.nl')}>Juridisch Loket</Text>{' '}
                        for legal help.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ====== RESPONSE EDIT MODAL ====== */}
      <Modal visible={showResponseModal} animationType="slide" transparent={false} onRequestClose={closeResponseModal}>
        <SafeAreaView style={styles.responseModalContainer} edges={['top']}>
          <View style={styles.responseModalHeader}>
            <TouchableOpacity onPress={closeResponseModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color="#475569" />
            </TouchableOpacity>
            <Text style={styles.responseModalTitle}>Edit Response</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView style={styles.responseModalScroll} contentContainerStyle={styles.responseModalScrollContent}>
            <TextInput style={styles.responseTextInput} value={editableResponse} onChangeText={setEditableResponse} multiline textAlignVertical="top" />
          </ScrollView>
          <View style={styles.responseModalButtons}>
            <TouchableOpacity style={styles.responseModalCopyButton} onPress={copyToClipboard} activeOpacity={0.7}>
              <Text style={styles.responseModalCopyButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ====== SETTINGS MODAL ====== */}
      <Modal visible={showSettingsModal} animationType="slide" transparent={false} onRequestClose={() => setShowSettingsModal(false)}>
        <SafeAreaView style={styles.settingsContainer} edges={['top']}>
          <View style={styles.settingsHeader}>
            <TouchableOpacity
              onPress={() => setShowSettingsModal(false)}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol ios_icon_name="arrow.left" android_material_icon_name="arrow-back" size={28} color="#475569" />
            </TouchableOpacity>
            <Text style={styles.settingsHeaderTitle}>Settings</Text>
            <View style={{ width: 44 }} />
          </View>
          
          <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsScrollContent}>
            <Text style={styles.settingsSectionTitle}>Language</Text>
            <View style={styles.languageGrid}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.languageCard,
                    selectedLanguage === lang.code && styles.languageCardActive,
                  ]}
                  onPress={() => handleLanguageChange(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text style={[
                    styles.languageLabel,
                    selectedLanguage === lang.code && styles.languageLabelActive,
                  ]}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.settingsSectionTitle, { marginTop: 32 }]}>About</Text>
            <View style={styles.aboutCard}>
              <Text style={styles.aboutAppName}>DocuScan</Text>
              <Text style={styles.aboutVersion}>Version 1.0</Text>
              <Text style={styles.aboutDescription}>AI-powered letter assistant for newcomers in the Netherlands</Text>
            </View>

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ====== CUSTOM ALERT MODAL ====== */}
      <Modal visible={customModal.visible} animationType="fade" transparent={true} onRequestClose={() => setCustomModal(prev => ({ ...prev, visible: false }))}>
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>{customModal.title}</Text>
            <Text style={styles.deleteModalMessage}>{customModal.message}</Text>
            <View style={styles.deleteModalButtons}>
              {customModal.buttons && customModal.buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={button.style === 'destructive' ? styles.deleteModalConfirmButton : styles.deleteModalCancelButton}
                  onPress={() => {
                    setCustomModal(prev => ({ ...prev, visible: false }));
                    if (button.onPress) button.onPress();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={button.style === 'destructive' ? styles.deleteModalConfirmText : styles.deleteModalCancelText}>
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
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
    position: 'relative',
  },
  cardDeleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  cardDeleteIcon: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
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
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  letterTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
    paddingRight: 32,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
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
  /* Scan Options Modal */
  scanOptionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  scanOptionsSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
  },
  scanOptionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 20,
  },
  scanOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  scanOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  scanOptionTextContainer: {
    flex: 1,
  },
  scanOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  scanOptionDescription: {
    fontSize: 13,
    color: '#94A3B8',
  },
  scanOptionCancelButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  scanOptionCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  /* Detail Modal */
  detailContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerSenderName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
  detailScrollView: {
    flex: 1,
  },
  detailScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
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
    fontSize: 15,
    color: '#1E293B',
    lineHeight: 23,
    fontWeight: '400',
  },
  summaryCardSubtext: {
    fontSize: 12,
    color: '#64748B',
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
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
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
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
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
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
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
  generateContainer: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 8,
  },
  generateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  generateDescription: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    maxWidth: 300,
  },
  generateButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
    minHeight: 52,
  },
  generateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
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
  /* Settings Modal */
  settingsContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  settingsHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingsScroll: {
    flex: 1,
  },
  settingsScrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    minWidth: '47%',
    flexGrow: 1,
  },
  languageCardActive: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.04)',
  },
  languageFlag: {
    fontSize: 20,
  },
  languageLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  languageLabelActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  aboutAppName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  aboutVersion: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 8,
  },
  aboutDescription: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  signOutButton: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.2)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
});
