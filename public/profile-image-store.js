(function initializeProfileImageStore(global) {
  const databaseName = 'MainProjectLocalProfile';
  const storeName = 'profileImages';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }

      const request = global.indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'userKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open the local image store.'));
    });
  }

  function getUserKey(user) {
    const id = String(user?.id || '').trim();
    if (id) return `id:${id}`;
    const username = String(user?.username || '').trim().toLowerCase();
    return username ? `username:${username}` : '';
  }

  async function get(userKey) {
    if (!userKey) return null;
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(userKey);
        request.onsuccess = () => resolve(request.result?.image || null);
        request.onerror = () => reject(request.error || new Error('Unable to read the local profile image.'));
      });
    } finally {
      database.close();
    }
  }

  async function set(userKey, image) {
    if (!userKey || !(image instanceof Blob)) {
      throw new Error('Invalid local profile image.');
    }
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put({
          userKey,
          image,
          updatedAt: new Date().toISOString()
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to save the local profile image.'));
        transaction.onabort = () => reject(transaction.error || new Error('Local profile image save was aborted.'));
      });
    } finally {
      database.close();
    }
  }

  async function remove(userKey) {
    if (!userKey) return;
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).delete(userKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Unable to delete the local profile image.'));
        transaction.onabort = () => reject(transaction.error || new Error('Local profile image deletion was aborted.'));
      });
    } finally {
      database.close();
    }
  }

  global.profileImageStore = { getUserKey, get, set, remove };
})(window);
