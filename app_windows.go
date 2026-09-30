//go:build windows

package main

import (
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procGetForegroundWindow = user32.NewProc("GetForegroundWindow")
	procGetAncestor         = user32.NewProc("GetAncestor")
	procOpenClipboard       = user32.NewProc("OpenClipboard")
	procEmptyClipboard      = user32.NewProc("EmptyClipboard")
	procSetClipboardData    = user32.NewProc("SetClipboardData")
	procCloseClipboard      = user32.NewProc("CloseClipboard")

	procGlobalAlloc  = kernel32.NewProc("GlobalAlloc")
	procGlobalLock   = kernel32.NewProc("GlobalLock")
	procGlobalUnlock = kernel32.NewProc("GlobalUnlock")
	procLstrcpyW     = kernel32.NewProc("lstrcpyW")
)

const (
	gaRoot        = 2
	gmemMoveable  = 0x0002
	cfUnicodeText = 13
)

// setNativeClipboard opens the clipboard bound to the foreground top-level root window
// handle so Windows Clipboard History (Win+V) attributes and captures the copied text.
func setNativeClipboard(text string) error {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd != 0 {
		if root, _, _ := procGetAncestor.Call(hwnd, uintptr(gaRoot)); root != 0 {
			hwnd = root
		}
	}

	r, _, err := procOpenClipboard.Call(hwnd)
	if r == 0 {
		return err
	}
	defer procCloseClipboard.Call()

	r, _, err = procEmptyClipboard.Call()
	if r == 0 {
		return err
	}

	u16 := utf16.Encode([]rune(text + "\x00"))
	bytesNeeded := uintptr(len(u16) * 2)

	hMem, _, err := procGlobalAlloc.Call(uintptr(gmemMoveable), bytesNeeded)
	if hMem == 0 {
		return err
	}

	ptr, _, err := procGlobalLock.Call(hMem)
	if ptr == 0 {
		return err
	}

	procLstrcpyW.Call(ptr, uintptr(unsafe.Pointer(&u16[0])))
	procGlobalUnlock.Call(hMem)

	r, _, err = procSetClipboardData.Call(uintptr(cfUnicodeText), hMem)
	if r == 0 {
		return err
	}

	return nil
}
