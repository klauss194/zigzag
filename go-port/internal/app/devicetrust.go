package app

import (
	"context"
	"fmt"

	"github.com/klauss/zigzag-go/internal/devicetrust"
)

func (a *App) readDeviceTrust() (*devicetrust.Manager, error) {
	graph := a.readGraph()
	if graph == nil || graph.client == nil {
		return nil, fmt.Errorf("NotLoggedIn: %w", ErrNoSession)
	}
	if graph.deviceTrust == nil {
		return nil, devicetrust.ErrUnavailable
	}
	return graph.deviceTrust, nil
}

func (a *App) DeviceStatus(ctx context.Context) (*devicetrust.Status, error) {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return nil, err
	}
	return manager.Status(ctx)
}

func (a *App) DeviceBootstrap(ctx context.Context, password string) error {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return err
	}
	return manager.Bootstrap(ctx, password)
}

func (a *App) DeviceReset(ctx context.Context, password string) error {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return err
	}
	return manager.Reset(ctx, password)
}

func (a *App) DeviceSignOut(ctx context.Context, deviceIDs []string, password string) (*devicetrust.Status, error) {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return nil, err
	}
	return manager.SignOut(ctx, deviceIDs, password)
}

func (a *App) DeviceStartVerification(ctx context.Context, deviceID string) (string, error) {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return "", err
	}
	return manager.StartVerification(ctx, deviceID)
}

func (a *App) DeviceConfirmSas(ctx context.Context, transactionID string) error {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return err
	}
	return manager.ConfirmSAS(ctx, transactionID)
}

func (a *App) DeviceCancelVerification(ctx context.Context, transactionID string) error {
	manager, err := a.readDeviceTrust()
	if err != nil {
		return err
	}
	return manager.CancelVerification(ctx, transactionID)
}
