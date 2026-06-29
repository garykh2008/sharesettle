import React, { useState, useRef, useEffect } from 'react';
import { X, User, Camera, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import type { UserSession, SplitEvent } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSession;
  events: SplitEvent[];
  onUpdateCurrentUser: (updated: UserSession) => void;
  onUpdateEventsState: (updatedEvents: SplitEvent[]) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  events,
  onUpdateCurrentUser,
  onUpdateEventsState
}) => {
  const [name, setName] = useState(currentUser.name);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(currentUser.avatarUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(currentUser.name);
    setAvatarUrl(currentUser.avatarUrl || '');
    setPreviewUrl(currentUser.avatarUrl || '');
    setSelectedFile(null);
    setError('');
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        setError('大頭貼檔案大小不能超過 2MB！');
        return;
      }
      setSelectedFile(file);
      setError('');
      
      // 預覽圖片
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('姓名/稱呼不能為空！');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let finalAvatarUrl = avatarUrl;

      // 1. 上傳頭像到 Supabase Storage (如果有選擇新圖片)
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop() || 'jpg';
        const fileName = `${currentUser.id}/avatar_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, selectedFile, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) throw uploadError;

        // 取得公開的存取連結
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        finalAvatarUrl = publicUrl;
      }

      // 2. 更新 Supabase profiles 資料表
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          avatar_url: finalAvatarUrl
        })
        .eq('id', currentUser.id);

      if (profileError) throw profileError;

      // 3. 更新當前使用者 Session
      const updatedUser: UserSession = {
        ...currentUser,
        name: name.trim(),
        avatarUrl: finalAvatarUrl
      };
      onUpdateCurrentUser(updatedUser);

      // 4. 同步更新所有已加入活動的成員名單 (Batch Update)
      const updatedEvents = events.map((evt) => {
        const hasMe = evt.members.some(
          (m) => m.email.toLowerCase() === currentUser.email.toLowerCase()
        );
        if (!hasMe) return evt;

        const updatedMembers = evt.members.map((m) => {
          if (m.email.toLowerCase() === currentUser.email.toLowerCase()) {
            return {
              ...m,
              name: name.trim(),
              avatarUrl: finalAvatarUrl
            };
          }
          return m;
        });

        return {
          ...evt,
          members: updatedMembers
        };
      });

      // 推動活動成員異動到 Supabase 雲端
      for (const evt of updatedEvents) {
        const oldEvt = events.find((e) => e.id === evt.id);
        if (oldEvt) {
          // 只有當成員名單確有改變時才推送到雲端
          const hasChangedName = oldEvt.members.some(
            (m) => m.email.toLowerCase() === currentUser.email.toLowerCase() && (m.name !== name.trim() || m.avatarUrl !== finalAvatarUrl)
          );
          if (hasChangedName) {
            await supabase
              .from('events')
              .update({
                members: evt.members
              })
              .eq('id', evt.id);
          }
        }
      }

      onUpdateEventsState(updatedEvents);
      onClose();
    } catch (err: any) {
      console.error("更新個人資料失敗:", err);
      setError(err.message || '更新資料失敗，請重試。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal-content animate-scale-up" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <User className="title-gradient" size={20} />
            編輯個人設定
          </h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} disabled={loading} style={{ width: '32px', height: '32px' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
          {error && (
            <div className="alert-banner alert-banner-danger animate-fade-in" style={{ fontSize: '12px', margin: 0 }}>
              {error}
            </div>
          )}

          {/* 頭像編輯區域 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
            <div 
              onClick={() => !loading && fileInputRef.current?.click()}
              style={{ 
                position: 'relative', 
                width: '90px', 
                height: '90px', 
                borderRadius: '50%', 
                cursor: loading ? 'not-allowed' : 'pointer', 
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.02)'
              }}
            >
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="頭像預覽" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '32px', color: '#fff' }}>
                  {name[0]?.toUpperCase() || '?'}
                </div>
              )}
              
              {/* 照相機 overlay 圖示 */}
              <div style={{ 
                position: 'absolute', 
                bottom: 0, 
                left: 0, 
                right: 0, 
                background: 'rgba(0,0,0,0.6)', 
                padding: '4px 0', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                transition: 'opacity 0.2s'
              }}>
                <Camera size={14} style={{ color: '#fff' }} />
              </div>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>點選頭像可更換圖片 (大小限 2MB)</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              style={{ display: 'none' }} 
              disabled={loading}
            />
          </div>

          {/* 姓名編輯 */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '13px', fontWeight: '600' }}>您的姓名/稱呼</label>
            <input
              type="text"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：王小明"
              required
              disabled={loading}
              style={{ marginTop: '6px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ flex: 1, padding: '10px' }}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ flex: 2, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading && <Loader2 className="animate-spin" size={14} />}
              {loading ? '儲存中...' : '確認儲存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
