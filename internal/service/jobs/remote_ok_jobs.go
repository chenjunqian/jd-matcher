package jobs

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/crawler"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/os/gtime"
	"github.com/gogf/gf/v2/util/guid"
)

func StartRemoteOkMainPageJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "@every 3h", func(ctx context.Context) {
		startTime := gtime.Now()
		runRemoteOkMainPageJob(ctx)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "remote ok main page job cost %s", finishTime.Sub(startTime).String())
	}, "remoteok_main_page_job")

	if err != nil {
		g.Log().Line().Error(ctx, "add remote ok main page job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add remote ok main page job success")
	}
}

func runRemoteOkMainPageJob(ctx context.Context) {
	g.Log().Line().Info(ctx, "start remote ok main page job")
	jobs, err := crawler.GetRemoteOkJobs(ctx, []string{}, []string{"Worldwide"}, 1)
	if err != nil {
		g.Log().Line().Error(ctx, "get remote ok job error :", err)
		return
	}

	_ = storeRemoteOkJobs(ctx, jobs)

}

func storeRemoteOkJobs(ctx context.Context, jobs []crawler.CommonJob) (err error) {
	var jobEntities []entity.JobDetail
	for _, job := range jobs {
		jobEntities = append(jobEntities, entity.JobDetail{
			Id:       guid.S(),
			Title:    job.Title,
			JobDesc:  job.Description,
			JobTags:  job.Tags,
			Link:     job.Url,
			Source:   "remoteok",
			Location: job.Location,
			Salary:   job.Salary,
		})
	}
	err = dao.CreateJobDetailIfNotExist(ctx, jobEntities)
	if err != nil {
		g.Log().Line().Error(ctx, "add remote ok main page job failed : ", err)
		return
	}

	return
}
