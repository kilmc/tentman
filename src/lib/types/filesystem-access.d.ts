declare global {
	type FileSystemPermissionMode = 'read' | 'readwrite';
	type FileSystemPermissionState = 'granted' | 'denied' | 'prompt';

	interface FileSystemPermissionDescriptor {
		mode?: FileSystemPermissionMode;
	}

	interface FileSystemHandlePermissionMixin {
		queryPermission?(
			descriptor?: FileSystemPermissionDescriptor
		): Promise<FileSystemPermissionState>;
		requestPermission?(
			descriptor?: FileSystemPermissionDescriptor
		): Promise<FileSystemPermissionState>;
	}

	interface FileSystemHandle extends FileSystemHandlePermissionMixin {}
	interface FileSystemDirectoryHandle extends FileSystemHandlePermissionMixin {
		entries?(): AsyncIterableIterator<[string, FileSystemHandle]>;
	}

	interface DirectoryPickerOptions {
		mode?: FileSystemPermissionMode;
	}

	interface Window {
		showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
	}
}

export {};
