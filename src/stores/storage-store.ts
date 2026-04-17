"use client";

import { create } from "zustand";
import { ensureDirectoryStructure } from "@/lib/storage/client-fs";

// IndexedDB helpers for persisting FileSystemDirectoryHandle
const DB_NAME = "mnemovault-storage";
const STORE_NAME = "handles";
const HANDLE_KEY = "dirHandle";
const RESTORE_TIMEOUT_MS = 5000;

declare global {
  interface Window {
    __MNEMOVAULT_E2E_DIR_HANDLE__?: FileSystemDirectoryHandle;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("restore_timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandleToDB(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandleFromDB(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function clearHandleFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface StorageState {
  dirHandle: FileSystemDirectoryHandle | null;
  contentHandle: FileSystemDirectoryHandle | null;
  isReady: boolean;
  folderName: string | null;
  error: string | null;

  pickFolder: () => Promise<void>;
  restoreFolder: () => Promise<boolean>;
  clearFolder: () => void;
  getContentHandle: () => FileSystemDirectoryHandle | null;
}

export const useStorageStore = create<StorageState>((set, get) => ({
  dirHandle: null,
  contentHandle: null,
  isReady: false,
  folderName: null,
  error: null,

  pickFolder: async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await ensureDirectoryStructure(handle);
      const contentHandle = await handle.getDirectoryHandle("content");
      await saveHandleToDB(handle);
      set({
        dirHandle: handle,
        contentHandle,
        isReady: true,
        folderName: handle.name,
        error: null,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user cancelled
      set({ error: (e as Error).message });
    }
  },

  restoreFolder: async () => {
    try {
      const e2eHandle = window.__MNEMOVAULT_E2E_DIR_HANDLE__;
      if (e2eHandle) {
        await ensureDirectoryStructure(e2eHandle);
        const contentHandle = await e2eHandle.getDirectoryHandle("content");
        set({
          dirHandle: e2eHandle,
          contentHandle,
          isReady: true,
          folderName: e2eHandle.name,
          error: null,
        });
        return true;
      }

      const handle = await withTimeout(loadHandleFromDB(), RESTORE_TIMEOUT_MS);
      if (!handle) return false;

      const permission = await withTimeout(
        handle.queryPermission({ mode: "readwrite" }),
        RESTORE_TIMEOUT_MS
      );
      if (permission === "denied") {
        set({ error: "Permission denied. Please select the folder again." });
        return false;
      }
      if (permission === "prompt") {
        // Avoid boot-time permission prompt loops; ask user via Pick Folder button.
        return false;
      }

      await withTimeout(ensureDirectoryStructure(handle), RESTORE_TIMEOUT_MS);
      const contentHandle = await withTimeout(
        handle.getDirectoryHandle("content"),
        RESTORE_TIMEOUT_MS
      );
      set({
        dirHandle: handle,
        contentHandle,
        isReady: true,
        folderName: handle.name,
        error: null,
      });
      return true;
    } catch {
      return false;
    }
  },

  clearFolder: () => {
    clearHandleFromDB();
    set({
      dirHandle: null,
      contentHandle: null,
      isReady: false,
      folderName: null,
      error: null,
    });
  },

  getContentHandle: () => get().contentHandle,
}));
