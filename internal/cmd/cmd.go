package cmd

import (
	"context"
	"jd-matcher/internal/service/jobs"
	"jd-matcher/internal/service/llm"
	"jd-matcher/internal/service/telegram"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcmd"
)

var (
	Main = gcmd.Command{
		Name:  "main",
		Usage: "main",
		Brief: "start http server",
		Func: func(ctx context.Context, parser *gcmd.Parser) (err error) {
			s := g.Server()
			registerComponents(ctx)
			s.Run()
			return nil
		},
	}
)

func registerComponents(ctx context.Context) {
	llm.InitOpenAIClient(ctx)
	telegram.InitTelegramBot(ctx)
	jobs.Register(ctx)
}
