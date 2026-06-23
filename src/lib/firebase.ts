import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

// Configuration loaded from firebase-applet-config.json
const firebaseConfig = {
  projectId: "gen-lang-client-0889659541",
  appId: "1:143621100387:web:28cde049612afcd5f2f956",
  apiKey: "AIzaSyCi3Y4u5zZP11e-lPmwbcNhq-TRnqX5V5A",
  authDomain: "gen-lang-client-0889659541.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-c65333fd-043d-4cce-b990-a985158ab910",
  storageBucket: "gen-lang-client-0889659541.firebasestorage.app",
  messagingSenderId: "143621100387"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// -------------------------------------------------------------
// WAREHOUSE SYNC FUNCTIONS
// -------------------------------------------------------------

export interface Warehouse {
  id: string;
  name: string;
  scrapedInventoryData: any[];
  lastSyncTime: string;
  status: 'Online' | 'Offline';
}

/**
 * Sync local scraped inventory data to Firestore
 */
export async function syncInventoryToCloud(deviceId: string, name: string, scrapedData: any[]): Promise<void> {
  if (!deviceId) return;
  const docRef = doc(db, 'warehouses', deviceId);
  await setDoc(docRef, {
    id: deviceId,
    name: name || 'Kho mặc định',
    scrapedInventoryData: scrapedData || [],
    lastSyncTime: new Date().toISOString(),
    status: 'Online'
  }, { merge: true });
}

/**
 * Get all connected warehouses / devices
 */
export async function getWarehousesFromCloud(): Promise<Warehouse[]> {
  const colRef = collection(db, 'warehouses');
  const snapshot = await getDocs(colRef);
  const data: Warehouse[] = [];
  snapshot.forEach(doc => {
    data.push(doc.data() as Warehouse);
  });
  return data;
}

/**
 * Listen to all warehouses in real-time
 */
export function listenToWarehousesCloud(callback: (warehouses: Warehouse[]) => void) {
  const q = query(collection(db, 'warehouses'));
  return onSnapshot(q, (snapshot) => {
    const list: Warehouse[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data() as Warehouse);
    });
    callback(list);
  }, (err) => {
    console.error("Error listening to warehouses:", err);
  });
}

// -------------------------------------------------------------
// BOM SYNC FUNCTIONS
// -------------------------------------------------------------

export interface BomDefinition {
  maHang: string;
  rows: any[];
  updatedAt: string;
}

/**
 * Sync local BOM table to cloud
 */
export async function syncBomToCloud(maHang: string, rows: any[]): Promise<void> {
  if (!maHang) return;
  const docRef = doc(db, 'bom_definitions', maHang.trim());
  await setDoc(docRef, {
    maHang: maHang.trim(),
    rows: rows || [],
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get BOM definition from Cloud
 */
export async function getBomFromCloud(maHang: string): Promise<any[] | null> {
  if (!maHang) return null;
  const docRef = doc(db, 'bom_definitions', maHang.trim());
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return data.rows || [];
  }
  return null;
}

/**
 * Download all cloud BOMs to sync locally
 */
export async function getAllBomsFromCloud(): Promise<any[]> {
  const colRef = collection(db, 'bom_definitions');
  const snapshot = await getDocs(colRef);
  const data: any[] = [];
  snapshot.forEach(doc => {
    const item = doc.data();
    if (item.rows) {
      data.push(...item.rows);
    }
  });
  return data;
}

// -------------------------------------------------------------
// DISPATCH REMOTE COMMAND FUNCTIONS
// -------------------------------------------------------------

export interface RemoteDispatch {
  id: string;
  createdAt: string;
  maHang: string;
  models: string[];
  khsxData: any[];
  dispatchInfo: Record<string, any>;
  dispatchData: any[];
  detailedNeedsData: any;
  fifoSuggestions: any[];
  status: 'Pending' | 'Received' | 'Completed';
  targetDeviceId: string;
  createdBy: string;
}

/**
 * Send a remote dispatch command to Firestore
 */
export async function sendRemoteDispatch(dispatch: Omit<RemoteDispatch, 'id' | 'createdAt' | 'status'> & { id?: string; createdAt?: string }): Promise<string> {
  const id = dispatch.id || Date.now().toString();
  const docRef = doc(db, 'dispatches', id);
  const payload: RemoteDispatch = {
    ...dispatch,
    id,
    createdAt: dispatch.createdAt || new Date().toISOString(),
    status: 'Pending'
  };
  await setDoc(docRef, payload);
  return id;
}

/**
 * Listen to remote dispatches targeting a specific device
 */
export function listenToRemoteDispatches(deviceId: string, callback: (dispatches: RemoteDispatch[]) => void) {
  const colRef = collection(db, 'dispatches');
  // Order by creation time
  const q = deviceId 
    ? query(colRef, where('targetDeviceId', '==', deviceId))
    : query(colRef);
    
  return onSnapshot(q, (snapshot) => {
    const list: RemoteDispatch[] = [];
    snapshot.forEach(doc => {
      list.push(doc.data() as RemoteDispatch);
    });
    // Sort client-side by createdAt descending
    list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(list);
  }, (err) => {
    console.error("Error listening to dispatches:", err);
  });
}

/**
 * Fetch all remote dispatches from the cloud (for dashboard/history purposes)
 */
export async function getAllDispatchesFromCloud(): Promise<RemoteDispatch[]> {
  try {
    const colRef = collection(db, 'dispatches');
    const snapshot = await getDocs(colRef);
    const list: RemoteDispatch[] = [];
    snapshot.forEach(doc => {
      list.push(doc.data() as RemoteDispatch);
    });
    // Sort descending by createdAt
    list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.error("Error fetching all dispatches:", err);
    return [];
  }
}

/**
 * Update the status of a remote dispatch
 */
export async function updateDispatchStatus(id: string, status: 'Pending' | 'Received' | 'Completed'): Promise<void> {
  const docRef = doc(db, 'dispatches', id);
  await updateDoc(docRef, { status });
}

/**
 * Delete a remote dispatch
 */
export async function deleteRemoteDispatch(id: string): Promise<void> {
  const docRef = doc(db, 'dispatches', id);
  await deleteDoc(docRef);
}
