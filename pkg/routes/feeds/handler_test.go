// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package feeds

import (
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/notifications"
	"code.vikunja.io/api/pkg/user"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNotificationsAtomFeed(t *testing.T) {
	db.LoadAndAssertFixtures(t)

	t.Run("returns valid atom XML for authenticated user with no notifications", func(t *testing.T) {
		e := echo.New()
		req := httptest.NewRequest(http.MethodGet, "/feeds/notifications.atom", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		c.Set("userBasicAuth", &user.User{ID: 1, Name: "User 1", Username: "user1", Language: "en"})

		err := NotificationsAtomFeed(c)
		require.NoError(t, err)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.True(t, strings.HasPrefix(rec.Header().Get(echo.HeaderContentType), "application/atom+xml"),
			"unexpected content type: %s", rec.Header().Get(echo.HeaderContentType))

		// Must be parseable as XML.
		var doc struct {
			XMLName xml.Name `xml:"feed"`
			Title   string   `xml:"title"`
		}
		require.NoError(t, xml.Unmarshal(rec.Body.Bytes(), &doc))
		assert.Contains(t, doc.Title, "User 1", "feed title should include the user's name")
	})

	// The target user is not stored with the notification (json:"-"), so the
	// handler has to inject the feed's viewer as the target when re-hydrating.
	// Without that, rendering a task.assigned notification panics on a nil
	// Target (and could never pick the "assigned to you" phrasing).
	t.Run("renders task.assigned notifications relative to the viewer", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)

		notification := &models.TaskAssignedNotification{
			Doer:     &user.User{ID: 2, Username: "user2"},
			Assignee: &user.User{ID: 1, Username: "user1"},
			Task:     &models.Task{ID: 1, Title: "task1", Index: 1},
		}
		raw, err := json.Marshal(notification.ToDB())
		require.NoError(t, err)

		s := db.NewSession()
		defer s.Close()
		for _, notifiableID := range []int64{1, 3} {
			_, err = s.Insert(&notifications.DatabaseNotification{
				NotifiableID: notifiableID,
				Notification: raw,
				Name:         notification.Name(),
			})
			require.NoError(t, err)
		}
		require.NoError(t, s.Commit())

		fetchTitles := func(t *testing.T, u *user.User) []string {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/feeds/notifications.atom", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)
			c.Set("userBasicAuth", u)

			require.NoError(t, NotificationsAtomFeed(c))
			require.Equal(t, http.StatusOK, rec.Code)

			var doc struct {
				Entries []struct {
					Title string `xml:"title"`
				} `xml:"entry"`
			}
			require.NoError(t, xml.Unmarshal(rec.Body.Bytes(), &doc))
			titles := make([]string, 0, len(doc.Entries))
			for _, entry := range doc.Entries {
				titles = append(titles, entry.Title)
			}
			return titles
		}

		assigneeTitles := fetchTitles(t, &user.User{ID: 1, Username: "user1", Language: "en"})
		require.Len(t, assigneeTitles, 1)
		assert.Equal(t, `You have been assigned to "task1" (#1)`, assigneeTitles[0])

		otherTitles := fetchTitles(t, &user.User{ID: 3, Username: "user3", Language: "en"})
		require.Len(t, otherTitles, 1)
		assert.Equal(t, `"task1" (#1) has been assigned to user1`, otherTitles[0])
	})

	t.Run("returns 401 when context has no authenticated user", func(t *testing.T) {
		e := echo.New()
		req := httptest.NewRequest(http.MethodGet, "/feeds/notifications.atom", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		err := NotificationsAtomFeed(c)
		require.Error(t, err)
		httpErr, ok := err.(*echo.HTTPError)
		require.True(t, ok, "expected echo.HTTPError, got %T", err)
		assert.Equal(t, http.StatusUnauthorized, httpErr.Code)
	})
}
