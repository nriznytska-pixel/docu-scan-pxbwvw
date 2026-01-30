
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';

interface ScannedDocument {
  id: string;
  image_url: string;
  created_at: string;
}

export default function HomeScreen() {
  console.log('HomeScreen: Component rendered');
  
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    console.log('HomeScreen: Fetching scans from Supabase');
    fetchScans();
  }, []);

  const fetchScans = async () => {
    console.log('HomeScreen: Starting fetchScans');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('id, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('HomeScreen: Error fetching scans:', error);
        return;
      }

      console.log('HomeScreen: Fetched scans:', data?.length || 0);
      setDocuments(data || []);
    } catch (error) {
      console.error('HomeScreen: Exception fetching scans:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    console.log('HomeScreen: Requesting camera permission');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('HomeScreen: Camera permission denied');
      return false;
    }
    
    console.log('HomeScreen: Camera permission granted');
    return true;
  };

  const compressImage = async (uri: string): Promise<string | null> => {
    console.log('HomeScreen: Starting image compression');
    try {
      let currentCompress = 0.7;
      let compressedImage = await manipulateAsync(
        uri,
        [{ resize: { width: 1000 } }],
        { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
      );

      if (!compressedImage.base64) {
        console.error('HomeScreen: Failed to get base64 from compression');
        return null;
      }

      const MAX_SIZE_BYTES = 1 * 1024 * 1024;
      let currentBase64 = compressedImage.base64;

      while (currentBase64.length * 0.75 > MAX_SIZE_BYTES && currentCompress > 0.1) {
        console.log('HomeScreen: Image too large, recompressing with quality:', currentCompress - 0.1);
        currentCompress -= 0.1;
        const reCompressed = await manipulateAsync(
          uri,
          [{ resize: { width: 1000 } }],
          { compress: currentCompress, format: SaveFormat.JPEG, base64: true }
        );
        if (reCompressed.base64) {
          currentBase64 = reCompressed.base64;
        } else {
          break;
        }
      }

      console.log('HomeScreen: Image compressed successfully');
      return currentBase64;
    } catch (error) {
      console.error('HomeScreen: Error compressing image:', error);
      return null;
    }
  };

  const uploadToSupabase = async (base64: string): Promise<string | null> => {
    console.log('HomeScreen: Starting upload to Supabase');
    try {
      const fileExt = 'jpeg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `public/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('letters')
        .upload(filePath, decode(base64), {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) {
        console.error('HomeScreen: Error uploading to Supabase:', uploadError);
        return null;
      }

      const { data: publicUrlData } = supabase.storage
        .from('letters')
        .getPublicUrl(filePath);

      console.log('HomeScreen: Upload successful, URL:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('HomeScreen: Exception uploading to Supabase:', error);
      return null;
    }
  };

  const saveToDatabase = async (imageUrl: string): Promise<boolean> => {
    console.log('HomeScreen: ========== SAVING TO DATABASE ==========');
    console.log('HomeScreen: Image URL to save:', imageUrl);
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString()
    };
    
    console.log('HomeScreen: Data being inserted:');
    console.log('HomeScreen: - Table: scans');
    console.log('HomeScreen: - Columns and values:', JSON.stringify(dataToInsert, null, 2));
    
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('scans')
        .insert([dataToInsert])
        .select();

      if (insertError) {
        console.error('HomeScreen: ========== INSERT ERROR ==========');
        console.error('Insert error (full object):', JSON.stringify(insertError, null, 2));
        console.error('Error message:', insertError.message);
        console.error('Error code:', insertError.code);
        console.error('Error details:', insertError.details);
        console.error('Error hint:', insertError.hint);
        
        Alert.alert(
          'Помилка збереження',
          `Не вдалося зберегти запис про скан.\n\n` +
          `Повідомлення: ${insertError.message}\n` +
          `Код: ${insertError.code || 'N/A'}\n` +
          `Деталі: ${insertError.details || 'N/A'}\n` +
          `Підказка: ${insertError.hint || 'N/A'}\n\n` +
          `Дані для вставки:\n${JSON.stringify(dataToInsert, null, 2)}\n\n` +
          `Повна інформація виведена в консоль.`
        );
        return false;
      }

      console.log('HomeScreen: ========== INSERT SUCCESS ==========');
      console.log('HomeScreen: Inserted data:', JSON.stringify(insertData, null, 2));
      return true;
    } catch (error: any) {
      console.error('HomeScreen: ========== EXCEPTION SAVING TO DATABASE ==========');
      console.error('Exception (full object):', JSON.stringify(error, null, 2));
      console.error('Exception message:', error?.message || 'Unknown error');
      console.error('Exception stack:', error?.stack || 'No stack trace');
      
      Alert.alert(
        'Помилка збереження',
        `Виняток при збереженні запису.\n\n` +
        `Повідомлення: ${error?.message || 'Невідома помилка'}\n\n` +
        `Дані для вставки:\n${JSON.stringify(dataToInsert, null, 2)}\n\n` +
        `Повна інформація виведена в консоль.`
      );
      return false;
    }
  };

  const handleImageSelection = async (pickerResult: ImagePicker.ImagePickerResult) => {
    if (pickerResult.canceled) {
      console.log('HomeScreen: Image selection cancelled');
      return;
    }

    const uri = pickerResult.assets[0].uri;
    console.log('HomeScreen: Image selected, starting upload process');
    console.log('HomeScreen: Image URI:', uri);
    
    setUploading(true);

    const BUCKET_NAME = 'letters';
    const fileName = `${Date.now()}.jpeg`;
    const filePath = `public/${fileName}`;
    let fileSizeBytes = 0;

    try {
      console.log('HomeScreen: Starting image compression');
      const compressedBase64 = await compressImage(uri);
      
      if (!compressedBase64) {
        console.error('HomeScreen: Failed to compress image');
        Alert.alert(
          'Помилка',
          'Не вдалося стиснути зображення. Спробуйте інше фото.'
        );
        setUploading(false);
        return;
      }

      fileSizeBytes = Math.round(compressedBase64.length * 0.75);
      console.log('HomeScreen: File size before upload:', fileSizeBytes, 'bytes');
      console.log('HomeScreen: Bucket name being used:', BUCKET_NAME);
      console.log('HomeScreen: File path being used:', filePath);

      console.log('HomeScreen: Starting upload to Supabase Storage');
      const imageUrl = await uploadToSupabase(compressedBase64);
      
      if (!imageUrl) {
        console.error('HomeScreen: Failed to upload image to Supabase Storage');
        const errorDetails = `Помилка завантаження зображення\n\nРозмір файлу: ${fileSizeBytes} bytes (${(fileSizeBytes / 1024).toFixed(2)} KB)\nБакет: ${BUCKET_NAME}\nШлях: ${filePath}\n\nПеревірте налаштування Supabase Storage та права доступу до бакету.`;
        Alert.alert('Помилка завантаження', errorDetails);
        setUploading(false);
        return;
      }

      console.log('HomeScreen: Upload successful, saving to database');
      const saved = await saveToDatabase(imageUrl);
      
      if (!saved) {
        console.error('HomeScreen: Failed to save to database');
        Alert.alert(
          'Помилка',
          'Зображення завантажено, але не вдалося зберегти запис у базі даних.'
        );
        setUploading(false);
        return;
      }

      console.log('HomeScreen: Upload complete, refreshing scans');
      Alert.alert('Успіх', 'Лист завантажено!');
      await fetchScans();
      setUploading(false);
    } catch (error: any) {
      console.error('HomeScreen: Error in handleImageSelection');
      console.error('Upload error details:', JSON.stringify(error, null, 2));
      console.error('Error message:', error?.message || 'Unknown error');
      console.error('Error stack:', error?.stack || 'No stack trace');
      
      const errorMessage = error?.message || 'Невідома помилка';
      const errorCode = error?.code || 'N/A';
      const errorStatus = error?.status || error?.statusCode || 'N/A';
      
      const detailedErrorMessage = `Помилка завантаження зображення\n\nПовідомлення: ${errorMessage}\nКод помилки: ${errorCode}\nСтатус: ${errorStatus}\n\nРозмір файлу: ${fileSizeBytes} bytes (${(fileSizeBytes / 1024).toFixed(2)} KB)\nБакет: ${BUCKET_NAME}\nШлях: ${filePath}\n\nПовна інформація про помилку виведена в консоль.`;
      
      Alert.alert('Помилка', detailedErrorMessage);
      setUploading(false);
    }
  };

  const scanDocument = async () => {
    console.log('HomeScreen: User tapped Сфотографувати лист button');
    
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

      console.log('HomeScreen: Camera result:', result);
      await handleImageSelection(result);
    } catch (error) {
      console.error('HomeScreen: Error scanning document:', error);
    }
  };

  const importFromGallery = async () => {
    console.log('HomeScreen: User tapped Вибрати з галереї button');
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      console.log('HomeScreen: Gallery result:', result);
      await handleImageSelection(result);
    } catch (error) {
      console.error('HomeScreen: Error importing from gallery:', error);
    }
  };

  const viewDocument = (doc: ScannedDocument) => {
    console.log('HomeScreen: User tapped to view document:', doc.id);
    setSelectedDocument(doc);
  };

  const closeDocumentView = () => {
    console.log('HomeScreen: Closing document view');
    setSelectedDocument(null);
  };

  const confirmDeleteDocument = (docId: string) => {
    console.log('HomeScreen: User requested to delete document:', docId);
    setDocumentToDelete(docId);
    setShowDeleteModal(true);
  };

  const deleteDocument = async () => {
    if (documentToDelete) {
      console.log('HomeScreen: Deleting document:', documentToDelete);
      try {
        const { error } = await supabase
          .from('scans')
          .delete()
          .eq('id', documentToDelete);

        if (error) {
          console.error('HomeScreen: Error deleting scan:', error);
        } else {
          console.log('HomeScreen: Scan deleted successfully');
          await fetchScans();
        }
      } catch (error) {
        console.error('HomeScreen: Exception deleting scan:', error);
      }

      setShowDeleteModal(false);
      setDocumentToDelete(null);
      
      if (selectedDocument && selectedDocument.id === documentToDelete) {
        setSelectedDocument(null);
      }
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

  const emptyStateText = 'Ще немає сканованих листів';
  const emptyStateSubtext = 'Натисніть кнопку нижче, щоб сканувати перший лист';
  const headerTitle = 'Мій Помічник';
  const scanButtonText = 'Сфотографувати лист';
  const galleryButtonText = 'Вибрати з галереї';
  const uploadingText = 'Завантаження...';
  const documentText = 'Лист';

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
        <IconSymbol
          ios_icon_name="doc.text.fill"
          android_material_icon_name="description"
          size={32}
          color={colors.primary}
        />
        <Text style={styles.headerTitle}>{headerTitle}</Text>
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
              return (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.documentCard}
                  onPress={() => viewDocument(doc)}
                  activeOpacity={0.7}
                >
                  <Image source={{ uri: doc.image_url }} style={styles.documentThumbnail} />
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
        {selectedDocument && (
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
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              <Image source={{ uri: selectedDocument.image_url }} style={styles.fullImage} resizeMode="contain" />
            </ScrollView>
          </SafeAreaView>
        )}
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
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 12,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
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
