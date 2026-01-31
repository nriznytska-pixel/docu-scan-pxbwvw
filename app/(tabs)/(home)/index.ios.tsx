
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
  console.log('HomeScreen (iOS): Component rendered');
  
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ScannedDocument | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    console.log('HomeScreen (iOS): Initial load - fetching scans');
    fetchScans();
  }, []);

  const fetchScans = async () => {
    console.log('HomeScreen (iOS): fetchScans started');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('id, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('HomeScreen (iOS): Error fetching scans:', JSON.stringify(error, null, 2));
        return;
      }

      const scansCount = data?.length || 0;
      console.log('HomeScreen (iOS): Successfully fetched scans, count:', scansCount);
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

      console.log('HomeScreen (iOS): Upload successful, getting public URL');

      const { data: publicUrlData } = supabase.storage
        .from('letters')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
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
    
    const dataToInsert = { 
      image_url: imageUrl,
      created_at: new Date().toISOString()
    };
    
    console.log('HomeScreen (iOS): Inserting into "scans" table:', JSON.stringify(dataToInsert, null, 2));
    
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
      console.log('HomeScreen (iOS): Inserted data:', JSON.stringify(insertData, null, 2));
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
    setSelectedDocument(doc);
  };

  const closeDocumentView = () => {
    console.log('HomeScreen (iOS): Closing document view');
    setSelectedDocument(null);
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

  const emptyStateText = 'Ще немає сканованих листів';
  const emptyStateSubtext = 'Натисніть кнопку нижче, щоб додати перший лист';
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
