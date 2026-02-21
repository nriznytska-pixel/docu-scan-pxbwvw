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
    console.log('HomeScreen (iOS): Language to save:', languageToSave);
    
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
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      language: languageToSave,
      user_id: user.id,
    };
    
    console.log('HomeScreen (iOS): Data to insert:', JSON.stringify(dataToInsert, null, 2));
    
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('scans')
        .insert([dataToInsert])
        .select();

      if (insertError) {
        console.error('HomeScreen (iOS): Insert error:', JSON.stringify(insertError, null, 2));
        
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Помилка збереження',
            message: `Не вдалося зберегти запис.\n\n${insertError.message}`,
            options: ['OK'],
            cancelButtonIndex: 0,
          },
          () => {}
        );
        return false;
      }

      console.log('HomeScreen (iOS): Insert success:', JSON.stringify(insertData, null, 2));
      
      const backendUrl = Constants.expoConfig?.extra?.backendUrl;
      
      if (backendUrl) {
        try {
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
      }
      
      return true;
    } catch (error: any) {
      console.error('HomeScreen (iOS): Exception in save:', error);
      
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
    console.log('HomeScreen (iOS): Starting image upload process');
    
    setUploading(true);

    try {
      const compressedBase64 = await compressImage(uri);
      
      if (!compressedBase64) {
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

      const imageUrl = await uploadToSupabase(compressedBase64);
      
      if (!imageUrl) {
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

      const saved = await saveToDatabase(imageUrl);
      
      if (!saved) {
        setUploading(false);
        return;
      }

      console.log('HomeScreen (iOS): Upload complete, refreshing scans');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      console.error('HomeScreen (iOS): Upload process error:', error);
      
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
    console.log('HomeScreen (iOS): User tapped scan button');
    
    if (scanCount >= FREE_SCAN_LIMIT) {
      console.log('HomeScreen: Free scan limit reached, showing paywall');
      setShowPaywall(true);
      return;
    }
    
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Take Photo', 'Choose from Gallery'],
        cancelButtonIndex: 0,
        title: 'Select Image Source',
        message: 'Choose how you want to add your document',
      },
      (buttonIndex) => {
        if (buttonIndex === 1) {
          scanDocument();
        } else if (buttonIndex === 2) {
          importFromGallery();
        }
      }
    );
  };

  const scanDocument = async () => {
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
      console.error('HomeScreen (iOS): Error launching camera:', error);
    }
  };

  const importFromGallery = async () => {
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
    console.log('HomeScreen (iOS): Opening detail view for ID:', doc.id);
    setSelectedDocument(doc);
    setDetailImageError(false);
    setActiveTab('summary');
  };

  const closeDocumentView = () => {
    setSelectedDocument(null);
    setDetailImageError(false);
    setActiveTab('summary');
    setEditableResponse('');
  };

  const confirmDeleteDocument = (docId: string) => {
    setDocumentToDelete(docId);
    setShowDeleteModal(true);
  };

  const deleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const { error } = await supabase
        .from('scans')
        .delete()
        .eq('id', documentToDelete);

      if (error) {
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

  const copyToClipboard = () => {
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

  // Parse analysis for selected document detail view
  const analysis = selectedDocument ? parseAnalysis(selectedDocument.analysis) : null;
  const senderName = analysis?.sender || 'Unknown Sender';
  const letterSubject = analysis?.summary_ua || 'No subject';
  const letterDate = selectedDocument ? formatDate(selectedDocument.created_at) : '';
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
            const hasAnalysis = !!item.analysis;
            const itemSenderText = itemAnalysis?.sender || (hasAnalysis ? 'Unknown' : 'Wordt geanalyseerd...');
            const itemTitleText = itemAnalysis?.summary_ua || (hasAnalysis ? 'No title' : 'Uw brief wordt geanalyseerd');
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
                    <View style={[styles.greenDot, !hasAnalysis && styles.orangeDot]} />
                    <Text style={styles.senderBadgeText}>{itemSenderText}</Text>
                    {!hasAnalysis && (
                      <ActivityIndicator size="small" color="#F59E0B" style={{ marginLeft: 6 }} />
                    )}
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

      {/* Uploading Overlay */}
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <View style={styles.uploadingContent}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.uploadingText}>Uw brief wordt geanalyseerd...</Text>
            <Text style={styles.uploadingSubtext}>Even geduld alstublieft</Text>
          </View>
        </View>
      )}

      {/* Delete Confirmation Modal */}
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

      {/* Document Detail Modal */}
      <Modal
        visible={!!selectedDocument}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDocumentView}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          {/* Detail Header */}
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={closeDocumentView} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#3B82F6" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>{senderName}</Text>
            <TouchableOpacity onPress={() => selectedDocument && confirmDeleteDocument(selectedDocument.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color="#DC2626" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailScrollView} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Sender & Date Info */}
            <View style={styles.detailInfoCard}>
              <View style={styles.senderBadge}>
                <View style={styles.greenDot} />
                <Text style={styles.senderBadgeText}>{senderName}</Text>
              </View>
              <Text style={styles.detailDate}>{letterDate}</Text>
              {bsnDetected && (
                <View style={styles.bsnBadge}>
                  <Text style={styles.bsnBadgeText}>🔒 BSN gedetecteerd en gemaskeerd</Text>
                </View>
              )}
            </View>

            {/* Urgency & Deadline */}
            {(urgency || deadline) && (
              <View style={styles.detailInfoCard}>
                {urgency && (
                  <View style={[
                    styles.urgencyBadge,
                    urgency === 'high' ? styles.urgencyHigh : urgency === 'medium' ? styles.urgencyMedium : styles.urgencyLow,
                  ]}>
                    <Text style={styles.urgencyText}>
                      {urgency === 'high' ? '🔴 Urgent' : urgency === 'medium' ? '🟡 Medium' : '🟢 Low'}
                    </Text>
                  </View>
                )}
                {deadline && daysRemaining !== null && (
                  <View style={styles.deadlineRow}>
                    <Text style={styles.deadlineLabel}>Deadline: {deadline}</Text>
                    <Text style={[
                      styles.daysRemainingText,
                      daysRemaining <= 7 ? { color: '#DC2626' } : { color: '#16A34A' },
                    ]}>
                      {daysRemaining > 0 ? `${daysRemaining} dagen` : 'Verlopen!'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Tab Buttons */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'summary' && styles.tabButtonActive]}
                onPress={() => setActiveTab('summary')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'summary' && styles.tabButtonTextActive]}>📋 Samenvatting</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'action' && styles.tabButtonActive]}
                onPress={() => setActiveTab('action')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'action' && styles.tabButtonTextActive]}>✅ Actieplan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'response' && styles.tabButtonActive]}
                onPress={() => setActiveTab('response')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'response' && styles.tabButtonTextActive]}>✉️ Antwoord</Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {!analysis ? (
              <View style={styles.detailInfoCard}>
                <ActivityIndicator size="small" color="#3B82F6" style={{ marginBottom: 12 }} />
                <Text style={styles.analyzingText}>Uw brief wordt geanalyseerd...</Text>
                <Text style={styles.analyzingSubtext}>Dit duurt meestal 15-30 seconden</Text>
              </View>
            ) : activeTab === 'summary' ? (
              <View style={styles.detailInfoCard}>
                <Text style={styles.sectionTitle}>Samenvatting</Text>
                <Text style={styles.summaryText}>{letterSubject}</Text>
              </View>
            ) : activeTab === 'action' ? (
              <View style={styles.detailInfoCard}>
                <Text style={styles.sectionTitle}>Wat moet u doen?</Text>
                {actionSteps.length > 0 ? (
                  actionSteps.map((step, index) => (
                    <View key={index} style={styles.stepRow}>
                      <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>{step.number || index + 1}</Text>
                      </View>
                      <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>{step.title}</Text>
                        <Text style={styles.stepDescription}>{step.description}</Text>
                        {step.deadline && <Text style={styles.stepDeadline}>⏰ {step.deadline}</Text>}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noDataText}>Geen actiestappen beschikbaar</Text>
                )}
              </View>
            ) : (
              <View style={styles.detailInfoCard}>
                <Text style={styles.sectionTitle}>Voorbeeldantwoord</Text>
                {responseTemplate ? (
                  <>
                    <TextInput
                      style={styles.responseInput}
                      multiline
                      value={editableResponse || responseTemplate}
                      onChangeText={setEditableResponse}
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={() => {
                        if (!editableResponse) setEditableResponse(responseTemplate);
                        copyToClipboard();
                      }}
                    >
                      <Text style={styles.copyButtonText}>📋 Kopiëren</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.noDataText}>Geen voorbeeldantwoord beschikbaar</Text>
                )}
                <Text style={styles.disclaimerText}>⚠️ Dit is een voorbeeld, geen juridisch advies.</Text>
              </View>
            )}

            {/* Scanned Image */}
            {selectedDocument?.image_url && (
              <View style={styles.detailInfoCard}>
                <Text style={styles.sectionTitle}>Gescande brief</Text>
                <Image
                  source={{ uri: selectedDocument.image_url }}
                  style={styles.detailImage}
                  resizeMode="contain"
                />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
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
  orangeDot: {
    backgroundColor: '#F59E0B',
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
  // Uploading overlay
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  uploadingContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  uploadingText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 16,
  },
  uploadingSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  // Delete modal
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
  // Detail modal styles
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  detailHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  detailScrollView: {
    flex: 1,
    padding: 20,
  },
  detailInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  detailDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
  },
  bsnBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  bsnBadgeText: {
    fontSize: 12,
    color: '#92400E',
  },
  urgencyBadge: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  urgencyHigh: { backgroundColor: '#FEE2E2' },
  urgencyMedium: { backgroundColor: '#FEF3C7' },
  urgencyLow: { backgroundColor: '#DCFCE7' },
  urgencyText: { fontSize: 13, fontWeight: '600' },
  deadlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deadlineLabel: { fontSize: 14, color: '#475569' },
  daysRemainingText: { fontSize: 14, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#3B82F6',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
  },
  analyzingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  analyzingSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  stepDeadline: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  responseInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
    minHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  copyButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noDataText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 20,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 12,
  },
  detailImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginTop: 8,
  },
});
