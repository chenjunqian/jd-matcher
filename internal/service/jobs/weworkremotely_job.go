package jobs

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/crawler"
	"time"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/os/gtime"
	"github.com/gogf/gf/v2/util/guid"
)

func StartWeWorkRemotelyParseJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "0 0 */2 * * *", func(ctx context.Context) {
		startTime := gtime.Now()
		runWeworkRemotelyJob(ctx)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "weworkremotely job cost %s", finishTime.Sub(startTime).String())
	}, "weworkremotely_job")

	if err != nil {
		g.Log().Line().Error(ctx, "add weworkremotely job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add weworkremotely job success")
	}
}

func runWeworkRemotelyJob(ctx context.Context) {
	g.Log().Line().Info(ctx, "start get weworkremotely job")
	jobs, err := crawler.GetAllFullStackJobs(ctx)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get weworkremotely failed :\n%+v\n", err)
		return
	}

	_ = storeWeWorkRemotelyJobs(ctx, jobs, &dao.JobDetail)
}

func storeWeWorkRemotelyJobs(ctx context.Context, jobs []crawler.CommonJob, jobDetailDao dao.IJobDetail) (err error) {
	var jobEntities []entity.JobDetail
	for _, job := range jobs {
		format := "Mon, 02 Jan 2006 15:04:05 -0700"
		parsedTime, err := time.Parse(format, job.UpdateTime)
		updateTime := gtime.New(parsedTime)
		if err != nil {
			g.Log().Line().Errorf(ctx, "parse weworkremotely job update time failed :\n%+v\n", err)
			updateTime = gtime.Now()
		}
		jobEntities = append(jobEntities, entity.JobDetail{
			Id:         guid.S(),
			Title:      job.Title,
			JobDesc:    job.Description,
			JobTags:    job.Tags,
			Link:       job.Url,
			Source:     "weworkremotely",
			Location:   job.Location,
			Salary:     job.Salary,
			UpdateTime: updateTime,
		})
	}
	err = jobDetailDao.CreateJobDetailIfNotExist(ctx, jobEntities)
	if err != nil {
		g.Log().Line().Errorf(ctx, "add remote ok main page job failed :\n%+v\n", err)
		return
	}

	return
}
