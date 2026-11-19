//go:build !android

package notify

func PlatformNotifier() Notifier { return nil }
