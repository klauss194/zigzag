package matrix

import "context"

func (c *Client) TypingNotice(ctx context.Context, roomID string, typing bool) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		return struct{}{}, core.TypingNotice(roomID, typing)
	})
	return err
}

func (c *Client) SetPresence(ctx context.Context, state string) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		return struct{}{}, core.SetPresence(state, nil)
	})
	return err
}

func (c *Client) Presence(ctx context.Context, userID string) (string, error) {
	core, err := c.needCore()
	if err != nil {
		return "", err
	}
	return await(ctx, func() (string, error) {
		return core.GetPresence(userID)
	})
}
