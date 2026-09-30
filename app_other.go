//go:build !windows

package main

// setNativeClipboard is a no-op fallback on non-Windows platforms.
func setNativeClipboard(_ string) error {
	return nil
}
