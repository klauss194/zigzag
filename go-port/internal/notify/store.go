package notify

import (
	"context"
	"database/sql"
	"fmt"

	jsonv2 "github.com/go-json-experiment/json"
	"go.mau.fi/util/dbutil"

	"github.com/klauss/zigzag-go/internal/matrix/id"
)

const notifySchema = `
CREATE TABLE IF NOT EXISTS zigzag_notify_room (
	room_id      TEXT    PRIMARY KEY,
	mode         TEXT    NOT NULL DEFAULT 'all',
	last_seen_ts INTEGER NOT NULL DEFAULT 0,
	member_count INTEGER NOT NULL DEFAULT 0
)`

const threadSchema = `
CREATE TABLE IF NOT EXISTS zigzag_notify_thread (
	room_id TEXT NOT NULL,
	root_id TEXT NOT NULL,
	PRIMARY KEY (room_id, root_id)
)`

const settingSchema = `
CREATE TABLE IF NOT EXISTS zigzag_notify_setting (
	name  TEXT    PRIMARY KEY,
	value INTEGER NOT NULL DEFAULT 0
)`

const dndUntilSetting = "dnd_until"

type column struct{ name, decl string }

var roomColumns = []column{
	{"member_count", "INTEGER NOT NULL DEFAULT 0"},
	{"notifs", "INTEGER NOT NULL DEFAULT 0"},
	{"highlights", "INTEGER NOT NULL DEFAULT 0"},
	{"uncounted", "INTEGER NOT NULL DEFAULT 0"},
	{"last_counted_ts", "INTEGER NOT NULL DEFAULT 0"},
	{"threads_read_ts", "INTEGER NOT NULL DEFAULT 0"},
	{"unread", "TEXT"},
	{"receipt_events", "TEXT"},
	{"threads_asked", "INTEGER NOT NULL DEFAULT 0"},
	{"has_left", "INTEGER NOT NULL DEFAULT 0"},
	{"group_dm", "INTEGER NOT NULL DEFAULT 0"},
}

var threadColumns = []column{
	{"last_seen_ts", "INTEGER NOT NULL DEFAULT 0"},
	{"notifs", "INTEGER NOT NULL DEFAULT 0"},
	{"highlights", "INTEGER NOT NULL DEFAULT 0"},
	{"last_counted_ts", "INTEGER NOT NULL DEFAULT 0"},
	{"participated", "INTEGER NOT NULL DEFAULT 0"},
	{"root_checked", "INTEGER NOT NULL DEFAULT 0"},
	{"last_activity_ts", "INTEGER NOT NULL DEFAULT 0"},
	{"unread", "TEXT"},
}

type Row struct {
	Mode Mode

	LastSeenTS int64

	ThreadsReadTS int64
	MemberCount   int

	Unread Unread

	ReceiptEvents []KnownEvent

	Left bool

	GroupDM bool
}

func (r Row) clone() Row {
	r.Unread = r.Unread.clone()
	r.ReceiptEvents = append([]KnownEvent(nil), r.ReceiptEvents...)
	return r
}

type ThreadKey struct {
	RoomID id.RoomID
	RootID id.EventID
}

type ThreadRow struct {
	LastSeenTS int64
	Unread     Unread

	Participated bool

	RootChecked bool

	LastActivityTS int64
}

type Store struct {
	db *dbutil.Database
}

func NewStore(ctx context.Context, db *dbutil.Database) (*Store, error) {
	if _, err := db.Exec(ctx, notifySchema); err != nil {
		return nil, fmt.Errorf("notify: create table: %w", err)
	}
	if _, err := db.Exec(ctx, threadSchema); err != nil {
		return nil, fmt.Errorf("notify: create thread table: %w", err)
	}
	if _, err := db.Exec(ctx, settingSchema); err != nil {
		return nil, fmt.Errorf("notify: create setting table: %w", err)
	}

	err := db.DoTxn(ctx, nil, func(ctx context.Context) error {
		addedToRooms, err := addMissingColumns(ctx, db, "zigzag_notify_room", roomColumns)
		if err != nil {
			return err
		}

		if addedToRooms["threads_read_ts"] {
			if _, err := db.Exec(ctx, `UPDATE zigzag_notify_room SET threads_read_ts = last_seen_ts`); err != nil {
				return fmt.Errorf("notify: seed threads_read_ts: %w", err)
			}
		}
		_, err = addMissingColumns(ctx, db, "zigzag_notify_thread", threadColumns)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func addMissingColumns(ctx context.Context, db *dbutil.Database, table string, columns []column) (map[string]bool, error) {
	rows, err := db.Query(ctx, `SELECT name FROM pragma_table_info('`+table+`')`)
	if err != nil {
		return nil, fmt.Errorf("notify: read columns of %s: %w", table, err)
	}
	present := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return nil, fmt.Errorf("notify: read columns of %s: %w", table, err)
		}
		present[name] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("notify: read columns of %s: %w", table, err)
	}

	added := map[string]bool{}
	for _, column := range columns {
		if present[column.name] {
			continue
		}
		if _, err := db.Exec(ctx, `ALTER TABLE `+table+` ADD COLUMN `+column.name+` `+column.decl); err != nil {
			return nil, fmt.Errorf("notify: add column %s.%s: %w", table, column.name, err)
		}
		added[column.name] = true
	}
	return added, nil
}

func (s *Store) LoadAll(ctx context.Context) (map[id.RoomID]Row, error) {
	rows, err := s.db.Query(ctx, `
		SELECT room_id, mode, last_seen_ts, threads_read_ts, member_count,
			notifs, highlights, uncounted, last_counted_ts, unread, receipt_events, has_left, group_dm
		FROM zigzag_notify_room`)
	if err != nil {
		return nil, fmt.Errorf("notify: load rooms: %w", err)
	}
	defer rows.Close()

	byRoomID := map[id.RoomID]Row{}
	for rows.Next() {
		var roomID, mode string
		var row Row
		var stored storedCounts
		var receiptEvents sql.NullString
		var left int
		if err := rows.Scan(&roomID, &mode, &row.LastSeenTS, &row.ThreadsReadTS, &row.MemberCount,
			&stored.notifs, &stored.highlights, &stored.uncounted, &stored.lastCountedTS, &stored.unread,
			&receiptEvents, &left, &row.GroupDM); err != nil {
			return nil, fmt.Errorf("notify: scan room: %w", err)
		}
		row.Mode = ParseMode(mode)
		row.Left = left != 0
		row.Unread = stored.decode(row.LastSeenTS)
		if receiptEvents.Valid && receiptEvents.String != "" {
			_ = jsonv2.Unmarshal([]byte(receiptEvents.String), &row.ReceiptEvents)
		}
		byRoomID[id.RoomID(roomID)] = row
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("notify: load rooms: %w", err)
	}
	return byRoomID, nil
}

func (s *Store) LoadThreads(ctx context.Context) (map[ThreadKey]ThreadRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT room_id, root_id, last_seen_ts, notifs, highlights, last_counted_ts, participated, root_checked,
			last_activity_ts, unread
		FROM zigzag_notify_thread`)
	if err != nil {
		return nil, fmt.Errorf("notify: load threads: %w", err)
	}
	defer rows.Close()

	byThread := map[ThreadKey]ThreadRow{}
	for rows.Next() {
		var roomID, rootID string
		var row ThreadRow
		var stored storedCounts
		var participated, rootChecked int
		if err := rows.Scan(&roomID, &rootID, &row.LastSeenTS, &stored.notifs, &stored.highlights,
			&stored.lastCountedTS, &participated, &rootChecked, &row.LastActivityTS, &stored.unread); err != nil {
			return nil, fmt.Errorf("notify: scan thread: %w", err)
		}
		row.Participated = participated != 0
		row.RootChecked = rootChecked != 0
		row.Unread = stored.decode(row.LastSeenTS)
		byThread[ThreadKey{RoomID: id.RoomID(roomID), RootID: id.EventID(rootID)}] = row
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("notify: load threads: %w", err)
	}
	return byThread, nil
}

type storedCounts struct {
	notifs, highlights int
	uncounted          int64
	lastCountedTS      int64
	unread             sql.NullString
}

func (c storedCounts) decode(lastSeenTS int64) Unread {
	if c.unread.Valid && c.unread.String != "" {
		var unread Unread
		if jsonv2.Unmarshal([]byte(c.unread.String), &unread) == nil {
			return unread
		}
	}

	stampedAt := c.lastCountedTS
	if stampedAt <= lastSeenTS {
		stampedAt = lastSeenTS + 1
	}
	var unread Unread
	for i := 0; i < max(c.notifs, c.highlights); i++ {
		unread.Events = append(unread.Events, UnreadEvent{
			TS:        stampedAt,
			Notify:    i < c.notifs,
			Highlight: i < c.highlights,
		})
	}
	if c.uncounted != 0 {
		unread.CutBeforeTS = stampedAt
	}
	return unread
}

func encodeUnread(unread Unread) (string, error) {
	encoded, err := jsonv2.Marshal(unread)
	if err != nil {
		return "", fmt.Errorf("notify: encode unread: %w", err)
	}
	return string(encoded), nil
}

func (s *Store) SetMode(ctx context.Context, roomID id.RoomID, mode Mode) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO zigzag_notify_room (room_id, mode)
		VALUES ($1, $2)
		ON CONFLICT (room_id) DO UPDATE SET mode=excluded.mode
		`, string(roomID), mode.String())
	if err != nil {
		return fmt.Errorf("notify: set mode: %w", err)
	}
	return nil
}

func (s *Store) DNDUntil(ctx context.Context) (int64, error) {
	var until int64

	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(value), 0) FROM zigzag_notify_setting WHERE name = $1
		`, dndUntilSetting).Scan(&until)
	if err != nil {
		return 0, fmt.Errorf("notify: read dnd: %w", err)
	}
	return until, nil
}

func (s *Store) SetDNDUntil(ctx context.Context, untilMS int64) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO zigzag_notify_setting (name, value)
		VALUES ($1, $2)
		ON CONFLICT (name) DO UPDATE SET value=excluded.value
		`, dndUntilSetting, untilMS)
	if err != nil {
		return fmt.Errorf("notify: set dnd: %w", err)
	}
	return nil
}

func (s *Store) SaveRooms(ctx context.Context, rooms map[id.RoomID]Row) error {
	return s.db.DoTxn(ctx, nil, func(ctx context.Context) error {
		for roomID, row := range rooms {
			unread, err := encodeUnread(row.Unread)
			if err != nil {
				return err
			}
			receiptEvents, err := jsonv2.Marshal(row.ReceiptEvents)
			if err != nil {
				return fmt.Errorf("notify: encode receipt events: %w", err)
			}
			notifs, highlights := row.Unread.counts()
			_, err = s.db.Exec(ctx, `
				INSERT INTO zigzag_notify_room
					(room_id, last_seen_ts, threads_read_ts, notifs, highlights, uncounted, unread, receipt_events,
					has_left, group_dm)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
				ON CONFLICT (room_id) DO UPDATE SET
					last_seen_ts=excluded.last_seen_ts,
					threads_read_ts=excluded.threads_read_ts,
					notifs=excluded.notifs,
					highlights=excluded.highlights,
					uncounted=excluded.uncounted,
					unread=excluded.unread,
					receipt_events=excluded.receipt_events,
					has_left=0,
					group_dm=excluded.group_dm
				`, string(roomID), row.LastSeenTS, row.ThreadsReadTS, notifs, highlights,
				row.Unread.CutBeforeTS, unread, string(receiptEvents), row.GroupDM)
			if err != nil {
				return fmt.Errorf("notify: save room %s: %w", roomID, err)
			}
		}
		return nil
	})
}

func (s *Store) SaveThreads(ctx context.Context, threads map[ThreadKey]ThreadRow) error {
	return s.db.DoTxn(ctx, nil, func(ctx context.Context) error {
		for key, row := range threads {
			unread, err := encodeUnread(row.Unread)
			if err != nil {
				return err
			}
			notifs, highlights := row.Unread.counts()
			_, err = s.db.Exec(ctx, `
				INSERT INTO zigzag_notify_thread
					(room_id, root_id, last_seen_ts, notifs, highlights, participated, root_checked,
					last_activity_ts, unread)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				ON CONFLICT (room_id, root_id) DO UPDATE SET
					last_seen_ts=excluded.last_seen_ts,
					notifs=excluded.notifs,
					highlights=excluded.highlights,
					participated=excluded.participated,
					root_checked=excluded.root_checked,
					last_activity_ts=excluded.last_activity_ts,
					unread=excluded.unread
				`, string(key.RoomID), string(key.RootID), row.LastSeenTS, notifs, highlights,
				row.Participated, row.RootChecked, row.LastActivityTS, unread)
			if err != nil {
				return fmt.Errorf("notify: save thread %s in %s: %w", key.RootID, key.RoomID, err)
			}
		}
		return nil
	})
}

func (s *Store) DeleteThreads(ctx context.Context, keys []ThreadKey) error {
	return s.db.DoTxn(ctx, nil, func(ctx context.Context) error {
		for _, key := range keys {
			if _, err := s.db.Exec(ctx, `DELETE FROM zigzag_notify_thread WHERE room_id = $1 AND root_id = $2`,
				string(key.RoomID), string(key.RootID)); err != nil {
				return fmt.Errorf("notify: delete thread %s in %s: %w", key.RootID, key.RoomID, err)
			}
		}
		return nil
	})
}

func (s *Store) ForgetRooms(ctx context.Context, roomIDs []id.RoomID) error {
	return s.db.DoTxn(ctx, nil, func(ctx context.Context) error {
		for _, roomID := range roomIDs {
			if _, err := s.db.Exec(ctx, `DELETE FROM zigzag_notify_room WHERE room_id = $1 AND mode = 'all'`, string(roomID)); err != nil {
				return fmt.Errorf("notify: forget room %s: %w", roomID, err)
			}
			if _, err := s.db.Exec(ctx, `
				UPDATE zigzag_notify_room SET
					last_seen_ts = 0, threads_read_ts = 0, member_count = 0, notifs = 0, highlights = 0,
					uncounted = 0, last_counted_ts = 0, unread = NULL, receipt_events = NULL, threads_asked = 0,
					has_left = 1
				WHERE room_id = $1`, string(roomID)); err != nil {
				return fmt.Errorf("notify: empty room %s: %w", roomID, err)
			}
			if _, err := s.db.Exec(ctx, `DELETE FROM zigzag_notify_thread WHERE room_id = $1`, string(roomID)); err != nil {
				return fmt.Errorf("notify: forget threads of %s: %w", roomID, err)
			}
		}
		return nil
	})
}

func (s *Store) SetMemberCounts(ctx context.Context, counts map[id.RoomID]int) error {
	return s.db.DoTxn(ctx, nil, func(ctx context.Context) error {
		for roomID, count := range counts {
			_, err := s.db.Exec(ctx, `
				INSERT INTO zigzag_notify_room (room_id, member_count)
				VALUES ($1, $2)
				ON CONFLICT (room_id) DO UPDATE SET member_count=excluded.member_count
				`, string(roomID), count)
			if err != nil {
				return fmt.Errorf("notify: set member count: %w", err)
			}
		}
		return nil
	})
}
