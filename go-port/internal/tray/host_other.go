//go:build !linux || android

package tray

func watchTrayHost(func(live bool)) (live bool, stop func(), err error) {
	return true, func() {}, nil
}
