"use client";

import { create } from "zustand";
import { ensureDirectoryStructure } from "@/lib/storage/client-fs";

// IndexedDB helpers for persisting FileSystemDirectoryHandle
const DB_NAME = "mnemovault-storage";
const STORE_NAME = "handles";
const HANDLE_KEY = "dirHandle";

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
      const handle = await loadHandleFromDB();
      if (!handle) return false;

      const permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        set({ error: "Permission denied. Please select the folder again." });
        return false;
      }

      await ensureDirectoryStructure(handle);
      const contentHandle = await handle.getDirectoryHandle("content");
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
