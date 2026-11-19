package media

import "golang.org/x/sys/windows"

func platformDownloadDirectory(string) string {
	directory, err := windows.KnownFolderPath(windows.FOLDERID_Downloads, 0)
	if err != nil {
		return ""
	}
	return directory
}
