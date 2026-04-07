"use client";

import { useEffect, useState, ReactNode } from "react";
import { useStorageStore } from "@/stores/storage-store";
import StorageSettings from "./StorageSettings";
import { FolderOpen, AlertTriangle } from "lucide-react";

interface StorageGuardProps {
  children: ReactNode;
}

function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export default function StorageGuard({ children }: StorageGuardProps) {
  const { isReady, restoreFolder } = useStorageStore();
  const [isRestoring, setIsRestoring] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!isFileSystemAccessSupported()) {
      setSupported(false);
      setIsRestoring(false);
      return;
    }

    restoreFolder().then((restored) => {
      setIsRestoring(false);
      if (!restored) {
        setShowSettings(true);
      }
    });
  }, [restoreFolder]);

  if (!supported) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="max-w-md text-center p-8">
          <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white/80 mb-3">
            지원하지 않는 브라우저
          </h2>
          <p className="text-sm text-white/40 leading-relaxed">
            MnemoVault는 File System Access API를 사용하여 로컬 폴더에
            위키 파일을 저장합니다. <strong className="text-white/60">Chrome 또는 Edge 86+</strong>
            에서 접속해주세요.
          </p>
        </div>
      </div>
    );
  }

  if (isRestoring) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="text-center">
          <FolderOpen className="w-8 h-8 text-white/20 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-white/30">스토리지 복원 중...</p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="max-w-md text-center p-8">
          <FolderOpen className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white/80 mb-3">
            위키 폴더를 선택하세요
          </h2>
          <p className="text-sm text-white/40 leading-relaxed mb-6">
            MnemoVault는 로컬 폴더에 위키 파일을 마크다운으로 저장합니다.
            저장할 폴더를 선택해주세요.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            폴더 선택
          </button>
        </div>
        {showSettings && (
          <StorageSettings onClose={() => setShowSettings(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      {children}
      {showSettings && (
        <StorageSettings onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
