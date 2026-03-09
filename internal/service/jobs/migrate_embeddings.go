package jobs

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/llm"

	"github.com/gogf/gf/v2/frame/g"
)

// RunEmbeddingMigrationJob performs a one-time migration of vector embeddings.
// It re-embeds job descriptions from the last 2 months and all user resumes.
// This should be run when changing the underlying embedding model.
func RunEmbeddingMigrationJob(ctx context.Context) {
	g.Log().Line().Info(ctx, "start embedding migration job")

	llmClient := llm.GetOpenRouterClient()

	migrateJobDescriptions(ctx, llmClient)
	migrateUserResumes(ctx, llmClient)

	g.Log().Line().Info(ctx, "finish embedding migration job")
}

func migrateJobDescriptions(ctx context.Context, llmClient llm.ILLMClient) {
	g.Log().Line().Info(ctx, "start migrate job descriptions")

	twoMonthsAgo := time.Now().AddDate(0, -2, 0)
	twoMonthsAgoStr := twoMonthsAgo.Format("2006-01-02")

	totalJobs, err := dao.JobDetail.Ctx(ctx).Where("update_time >= ?", twoMonthsAgoStr).Count()
	if err != nil {
		g.Log().Line().Error(ctx, "failed to get total job count for migration: ", err)
		return
	}
	if totalJobs == 0 {
		g.Log().Line().Info(ctx, "no jobs to migrate")
		return
	}

	g.Log().Line().Infof(ctx, "found %d jobs to migrate (updated since %s)", totalJobs, twoMonthsAgoStr)

	workerCount := 10
	jobChan := make(chan entity.JobDetail, workerCount*2)
	var wg sync.WaitGroup
	var processed int32

	// Start workers
	for range workerCount {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobChan {
				if job.JobDesc != "" {
					vector, err := llmClient.EmbeddingText(ctx, []string{job.JobDesc})
					if err != nil {
						g.Log().Line().Errorf(ctx, "failed to embed job %s: %v", job.Id, err)
					} else if len(vector) > 0 {
						job.JobDescEmbedding = vector[0]
						err = dao.JobDetail.UpdateJobDetailEmbedding(ctx, job)
						if err != nil {
							g.Log().Line().Errorf(ctx, "failed to update job %s: %v", job.Id, err)
						}
					}
				}

				p := atomic.AddInt32(&processed, 1)
				remaining := int32(totalJobs) - p
				g.Log().Line().Infof(ctx, "processed job %s, total processed: %d, remaining: %d", job.Id, p, remaining)
			}
		}()
	}

	// Feed jobs
	limit := 100
	for offset := 0; offset < totalJobs; offset += limit {
		var jobList []entity.JobDetail
		err := dao.JobDetail.Ctx(ctx).Where("update_time >= ?", twoMonthsAgoStr).Order("id asc").Limit(limit).Offset(offset).Scan(&jobList)
		if err != nil {
			g.Log().Line().Error(ctx, "failed to get job list for migration: ", err)
			break
		}

		for _, job := range jobList {
			jobChan <- job
		}
	}
	close(jobChan)
	wg.Wait()
	g.Log().Line().Info(ctx, "finish migrate job descriptions")
}

func migrateUserResumes(ctx context.Context, llmClient llm.ILLMClient) {
	g.Log().Line().Info(ctx, "start migrate user resumes")

	totalCount, err := dao.UserInfo.GetAllUserInfoCount(ctx)
	if err != nil {
		g.Log().Line().Error(ctx, "failed to get user info count for migration: ", err)
		return
	}
	if totalCount == 0 {
		g.Log().Line().Info(ctx, "no user resumes to migrate")
		return
	}

	g.Log().Line().Infof(ctx, "found %d users to migrate", totalCount)

	workerCount := 10
	userChan := make(chan entity.UserInfo, workerCount*2)
	var wg sync.WaitGroup
	var processed int32

	// Start workers
	for range workerCount {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for user := range userChan {
				if user.Resume != "" {
					vector, err := llmClient.EmbeddingText(ctx, []string{user.Resume})
					if err != nil {
						g.Log().Line().Errorf(ctx, "failed to embed user %s resume: %v", user.Id, err)
					} else if len(vector) > 0 {
						err = dao.UserInfo.UpdateUserResume(ctx, user.TelegramId, user.Resume, vector[0])
						if err != nil {
							g.Log().Line().Errorf(ctx, "failed to update user %s resume: %v", user.Id, err)
						}
					}
				}

				p := atomic.AddInt32(&processed, 1)
				remaining := int32(totalCount) - p
				g.Log().Line().Infof(ctx, "processed user %s resume, total processed: %d, remaining: %d", user.Id, p, remaining)
			}
		}()
	}

	// Feed users
	limit := 100
	for offset := 0; offset < totalCount; offset += limit {
		userList, err := dao.UserInfo.GetUserInfoList(ctx, offset, limit)
		if err != nil {
			g.Log().Line().Error(ctx, "failed to get user info list for migration: ", err)
			break
		}

		for _, user := range userList {
			userChan <- user
		}
	}
	close(userChan)
	wg.Wait()
	g.Log().Line().Info(ctx, "finish migrate user resumes")
}
