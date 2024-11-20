package main

import (
	_ "jd-matcher/internal/packed"

	"github.com/gogf/gf/v2/os/gctx"

	"jd-matcher/internal/cmd"
)

func main() {
	cmd.Main.Run(gctx.GetInitCtx())
}
