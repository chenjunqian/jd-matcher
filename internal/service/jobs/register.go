package jobs

import (
	"context"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
)


func Register(ctx context.Context) {
	StartRemoteOkMainPageJob(ctx)
	StartEmbeddingJobDetailJob(ctx)
	StartFindMatchJobByResumeJob(ctx)
	StartNotifyUserMatchedJob(ctx)
	entities := gcron.Entries()

	for _, entity := range entities {
		g.Log().Line().Infof(ctx, "add cron job %s success", entity.Name)
	}
}