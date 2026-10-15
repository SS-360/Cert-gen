// IndexedDB is local to this browser profile and origin. No network storage.
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('certgen-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('templates', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage is unavailable. Check your browser privacy settings.'));
    request.onblocked = () => reject(new Error('Close other CertGen tabs and try again.'));
  });
}

async function transaction(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('templates', mode);
      const request = operation(tx.objectStore('templates'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error('Could not access saved templates. Browser storage may be full or disabled.'));
    });
  } finally { database.close(); }
}

export const saveTemplate = (record) => transaction('readwrite', (store) => store.put(record));
export const listTemplates = () => transaction('readonly', (store) => store.getAll());
export const getTemplate = (id) => transaction('readonly', (store) => store.get(id));
export const deleteTemplate = (id) => transaction('readwrite', (store) => store.delete(id));
