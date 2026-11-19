package sqlitedb

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"

	"modernc.org/sqlite"
)

const busyTimeout = "PRAGMA busy_timeout = 5000"

var fkWALPragmas = []string{
	busyTimeout,
	"PRAGMA foreign_keys = ON",
	"PRAGMA journal_mode = WAL",
	"PRAGMA synchronous = NORMAL",
}

type pragmaDriver struct {
	base    *sqlite.Driver
	pragmas []string
}

func (d pragmaDriver) Open(name string) (driver.Conn, error) {
	conn, err := d.base.Open(name)
	if err != nil {
		return nil, err
	}
	execer, ok := conn.(driver.ExecerContext)
	if !ok {
		_ = conn.Close()
		return nil, fmt.Errorf("sqlitedb: connection cannot exec")
	}
	for _, pragma := range d.pragmas {
		if _, err := execer.ExecContext(context.Background(), pragma, nil); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("sqlitedb: %s: %w", pragma, err)
		}
	}
	return conn, nil
}

func init() {
	sql.Register("sqlite3", pragmaDriver{base: &sqlite.Driver{}, pragmas: []string{busyTimeout}})
	sql.Register("sqlite3-fk-wal", pragmaDriver{base: &sqlite.Driver{}, pragmas: fkWALPragmas})
}
