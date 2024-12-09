package jobs

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/llm"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/os/gtime"
)

func StartEmbeddingJobDetailJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "0 */10 * * * *", func(ctx context.Context) {
		startTime := gtime.Now()
		runEmbeddingJobDetailJob(ctx, &dao.JobDetail)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "embedding job detail job cost %s", finishTime.Sub(startTime).String())
	}, "embedding_job_detail_job")

	if err != nil {
		g.Log().Line().Error(ctx, "add embedding job detail job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add embedding job detail job success")
	}
}

func runEmbeddingJobDetailJob(ctx context.Context, jobDetailDao dao.IJobDetail) {
	g.Log().Line().Info(ctx, "start embedding job detail job")

	totalCount, err := jobDetailDao.GetEmptyJobDescEmbeddingJobDetailTotalCount(ctx)
	if err != nil {
		g.Log().Line().Error(ctx, "get empty job desc embedding job detail total count error : ", err)
		return
	}

	if totalCount == 0 {
		g.Log().Line().Info(ctx, "no empty job desc embedding job detail")
		return
	}

	if totalCount > 100 {
		// if total count more than 100, use batch embedding, query 100 at a time
		for i := 0; i < totalCount; i += 100 {
			jobList, err := jobDetailDao.GetEmptyJobDescEmbeddingJobList(ctx, i, 100)
			if err != nil {
				g.Log().Line().Error(ctx, "get empty job desc embedding job list error : ", err)
				return
			}

			for _, job := range jobList {
				embeddingJobDetailAndStore(ctx, job, jobDetailDao)
			}
		}
	} else {
		jobList, err := jobDetailDao.GetEmptyJobDescEmbeddingJobList(ctx, 0, totalCount)
		if err != nil {
			g.Log().Line().Error(ctx, "get empty job desc embedding job list error : ", err)
			return
		}

		for _, job := range jobList {
			embeddingJobDetailAndStore(ctx, job, jobDetailDao)
		}
	}
}

func embeddingJobDetailAndStore(ctx context.Context, job entity.JobDetail, jobDetailDao dao.IJobDetail) (err error) {
	contents := []string{job.JobDesc}
	vector, err := llm.GetClient().EmbeddingText(ctx, contents)
	if err != nil {
		g.Log().Line().Error(ctx, "embedding job desc error : ", err)
		return
	}

	job.JobDescEmbedding = vector[0]
	err = jobDetailDao.UpdateJobDetailEmbedding(ctx, job)
	if err != nil {
		g.Log().Line().Error(ctx, "update job detail embedding error : ", err)
		return
	}

	return
}
