# nicebear-go

NiceBear Go SDK — Dynamic Avatar Infrastructure. Standard library only.

```bash
go get github.com/nicebear/nicebear-go
```

```go
package main

import (
	"fmt"

	nicebear "github.com/nicebear/nicebear-go"
)

func main() {
	c := nicebear.New("https://api.nicebear.dev", "nb_live_...")

	fmt.Println(c.AvatarURL("av_123", "john", nil))
	fmt.Println(c.DailyURL("av_123"))

	col, err := c.CreateCollection("team-avatars", "pixel-art", "")
	if err != nil {
		panic(err)
	}
	av, err := c.CreateAvatar(map[string]any{
		"collection_id": col["id"],
		"type":          "generated",
		"engine":        "pixel-art",
	})
	if err != nil {
		if apiErr, ok := err.(*nicebear.APIError); ok {
			panic(apiErr)
		}
		panic(err)
	}
	fmt.Println(av["id"])
}
```

Mirrors `packages/openapi/spec.yaml`. Version tracks the API, not the app.
