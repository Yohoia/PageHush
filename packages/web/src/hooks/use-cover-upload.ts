import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { ApiError, uploadCover } from '@/lib/api';

const MAX_COVER_FILE_SIZE = 5 * 1024 * 1024;

export function useCoverUpload(initialCover: string | null, initialAssetId: string | null) {
  const coverInputId = useId();
  const [cover, setCover] = useState(initialCover);
  const [coverAssetId, setCoverAssetId] = useState(initialAssetId);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = coverObjectUrl;

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [coverObjectUrl]);

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCoverError('请选择图片文件');
      return;
    }

    if (file.size > MAX_COVER_FILE_SIZE) {
      setCoverError('封面图片不能超过 5MB');
      return;
    }

    setCoverError(null);

    try {
      const asset = await uploadCover(file);
      setCover(asset.url);
      setCoverAssetId(asset.id);
    } catch (error) {
      const isValidationError = error instanceof ApiError && [400, 413, 415].includes(error.status);

      if (!isValidationError) {
        // API / MinIO 不可用时继续使用本地预览，保证编辑不中断。
        const nextObjectUrl = URL.createObjectURL(file);
        setCover(nextObjectUrl);
        setCoverObjectUrl(nextObjectUrl);
      } else {
        setCoverError(error instanceof Error ? error.message : '封面上传失败');
      }
    } finally {
      event.target.value = '';
    }
  };

  return {
    coverInputId,
    cover,
    setCover,
    coverAssetId,
    setCoverAssetId,
    coverError,
    handleCoverChange,
  };
}
