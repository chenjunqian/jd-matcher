package jobs

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/crawler"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/util/guid"
)

func StartRemoteOkMainPageJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "0 0 */12 * * *", func(ctx context.Context) {
		jobs, err := crawler.GetRemoteOkJobs(ctx, []string{"dev", "engineer"}, []string{"Worldwide"}, 0)
		if err != nil {
			g.Log().Line().Error(ctx, "get remote ok job error", err)
			return
		}
		
		var jobEntities []entity.JobDetail
		for _, job := range jobs {
			jobEntities = append(jobEntities, entity.JobDetail{
				Id:      guid.S(),
				Title:   job.Title,
				JobDesc: job.Description,
				JobTags: job.Tags,
				Link:    job.Url,
				Source:  "remoteok",
			})
		}
		err = dao.CreateJobDetail(ctx, jobEntities)
		if err != nil {
			g.Log().Line().Error(ctx, "add remote ok main page job error", err)
			return
		}
	})
	if err != nil {
		g.Log().Line().Error(ctx, "add remote ok main page job error", err)
	} else {
		g.Log().Line().Info(ctx, "add remote ok main page job success")
	}
}
