"use client";

import { useStorageStore } from "@/stores/storage-store";
import { X, FolderOpen, CheckCircle, AlertCircle, Trash2 } from "lucide-react";

interface StorageSettingsProps {
  onClose: () => void;
}

export default function StorageSettings({ onClose }: StorageSettingsProps) {
  const { folderName, isReady, error, pickFolder, clearFolder } =
    useStorageStore();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium text-white/80 flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Storage Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/30 hover:text-white/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-white/40 mb-5 leading-relaxed">
          위키 파일이 저장될 로컬 폴더를 선택하세요. 브라우저가 해당 폴더에
          대한 읽기/쓰기 권한을 요청합니다.
        </p>

        {/* Current folder status */}
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02] mb-5">
          {isReady ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-emerald-400">연결됨</div>
                <div className="text-xs text-white/40 truncate">
                  📁 {folderName}
                </div>
              </div>
              <button
                onClick={clearFolder}
                className="ml-auto p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-red-500/10"
                title="연결 해제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-white/20 shrink-0" />
              <div>
                <div className="text-sm text-white/40">폴더 미연결</div>
                <div className="text-xs text-white/20">
                  폴더를 선택하면 자동으로 위키 구조가 생성됩니다
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-5">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={pickFolder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            {isReady ? "다른 폴더 선택" : "폴더 선택"}
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-white/5 text-[10px] text-white/20 space-y-1">
          <p>
            선택한 폴더 아래에 <code className="text-white/30">content/</code>{" "}
            구조가 자동 생성됩니다.
          </p>
          <p>Chrome, Edge 86+ 지원. Safari, Firefox에서는 사용할 수 없습니다.</p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            disabled={!isReady}
            className="px-4 py-1.5 rounded text-sm bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
