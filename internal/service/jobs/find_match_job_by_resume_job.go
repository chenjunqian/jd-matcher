package jobs

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/os/gtime"
)

func StartFindMatchJobByResumeJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "0 0 */1 * * *", func(ctx context.Context) {
		startTime := gtime.Now()
		runFindMatchJobByResumeJob(ctx)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "query match job by resume job cost %s", finishTime.Sub(startTime).String())
	}, "query_match_job_by_resume_job")

	if err != nil {
		g.Log().Line().Error(ctx, "add query match job by resume job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add query match job by resume job success")
	}
}

func runFindMatchJobByResumeJob(ctx context.Context) {
	g.Log().Line().Info(ctx, "start query match job by resume job")
	totalCount, err := dao.GetUserInfoCount(ctx)
	if err != nil {
		g.Log().Line().Error(ctx, "get user info count error : ", err)
		return
	}

	if totalCount == 0 {
		g.Log().Line().Info(ctx, "no user info")
		return
	}

	if totalCount > 100 {
		// if total count more than 100, use batch embedding, query 100 at a time
		for i := 0; i < totalCount; i += 100 {
			userInfoList, err := dao.GetUserInfoList(ctx, i, 100)
			if err != nil {
				g.Log().Line().Error(ctx, "get user info list error : ", err)
				return
			}

			for _, userInfo := range userInfoList {
				findMatchJobByResumeAndStore(ctx, userInfo)
			}
		}
	} else {
		userInfoList, err := dao.GetUserInfoList(ctx, 0, totalCount)
		if err != nil {
			g.Log().Line().Error(ctx, "get user info list error : ", err)
			return
		}

		for _, userInfo := range userInfoList {
			findMatchJobByResumeAndStore(ctx, userInfo)
		}
	}
}

func findMatchJobByResumeAndStore(ctx context.Context, userInfo entity.UserInfo) {

	jobList, err := dao.QueryJobDetailByEmbedding(ctx, userInfo.ResumeEmbedding)
	if err != nil {
		g.Log().Line().Error(ctx, "query job by resume embedding error : ", err)
		return
	}

	var matchJobs []entity.UserMatchedJob
	for _, job := range jobList {
		matchJobs = append(matchJobs, entity.UserMatchedJob{
			UserId: userInfo.Id,
			JobId:  job.Id,
		})
	}

	err = dao.CreateMatchJobIfNotExist(ctx, matchJobs)
	if err != nil {
		g.Log().Line().Error(ctx, "create match job if not exist error : ", err)
	}
}
