declare global {
	interface StorageManager {
		getDirectory?(): Promise<FileSystemDirectoryHandle>;
		persist?(): Promise<boolean>;
	}

	interface Navigator {
		storage?: StorageManager;
	}
}

export {};
