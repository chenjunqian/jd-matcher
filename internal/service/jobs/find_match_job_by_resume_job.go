package jobs

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/dto"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/llm"
	"time"

	"github.com/gogf/gf/v2/encoding/gjson"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/os/gtime"
	"github.com/gogf/gf/v2/util/gconv"
)

func StartFindMatchJobByResumeJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "0 0 */3 * * *", func(ctx context.Context) {
		startTime := gtime.Now()
		runFindMatchJobByResumeJob(ctx, &dao.UserInfo, &dao.UserMatchedJob, &dao.JobDetail)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "query match job by resume job cost %s", finishTime.Sub(startTime).String())
	}, "query_match_job_by_resume_job")

	if err != nil {
		g.Log().Line().Error(ctx, "add query match job by resume job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add query match job by resume job success")
	}
}

func runFindMatchJobByResumeJob(ctx context.Context, userInfoDao dao.IUserInfo, userMatchedDao dao.IUserMatchedJob, jobDetailDao dao.IJobDetail) {
	g.Log().Line().Info(ctx, "start query match job by resume job")
	totalCount, err := userInfoDao.GetEmptyResumeUserInfoCount(ctx)
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
			userInfoList, err := userInfoDao.GetEmptyResumeUserInfoList(ctx, i, 100)
			if err != nil {
				g.Log().Line().Error(ctx, "get user info list error : ", err)
				return
			}

			for _, userInfo := range userInfoList {
				findMatchJobByResumeAndStore(ctx, userInfo, userMatchedDao, jobDetailDao)
			}
		}
	} else {
		userInfoList, err := userInfoDao.GetEmptyResumeUserInfoList(ctx, 0, totalCount)
		if err != nil {
			g.Log().Line().Error(ctx, "get user info list error : ", err)
			return
		}

		for _, userInfo := range userInfoList {
			findMatchJobByResumeAndStore(ctx, userInfo, userMatchedDao, jobDetailDao)
		}
	}
}

func findMatchJobByResumeAndStore(ctx context.Context, userInfo entity.UserInfo, userMatchedDao dao.IUserMatchedJob, jobDetailDao dao.IJobDetail) {

	g.Log().Line().Infof(ctx, "start query match job by resume job for user %s", userInfo.Name)
	oneMonthAgo := time.Now().AddDate(0, -1, 0)
	oneMonthAgoStr := oneMonthAgo.Format("2006-01-02")
	jobList, err := jobDetailDao.QueryJobDetailByEmbedding(ctx, oneMonthAgoStr, userInfo.ResumeEmbedding)
	if err != nil {
		g.Log().Line().Error(ctx, "query job by resume embedding error : ", err)
		return
	}

	var matchJobsInput []dto.UserMatchedJobPromptInput
	for _, job := range jobList {
		inputJob := dto.UserMatchedJobPromptInput{
			JobId:          job.Id,
			JobTitle:       job.Title,
			JobLink:        job.Link,
			JobDescription: job.JobDesc,
			Location:       job.Location,
			Salary:         job.Salary,
		}
		matchJobsInput = append(matchJobsInput, inputJob)
	}

	matchjobsJsonStr := gjson.New(matchJobsInput).MustToJsonIndentString()
	g.Log().Line().Debugf(ctx, "match jobs JSON string :\n%s", matchjobsJsonStr)

	resumeStr := userInfo.Resume
	g.Log().Line().Debugf(ctx, "resume string :\n%s", resumeStr)

	jobExpectations := userInfo.JobExpectations
	g.Log().Line().Debugf(ctx, "job expectations string :\n%s", jobExpectations)

	promptTemp, err := llm.GetJobMatchPromptTemplate(ctx)
	if err != nil {
		g.Log().Line().Error(ctx, "get job match prompt template error : ", err)
		return
	}

	prompt := llm.GenerateResumeMatchPrompt(ctx, promptTemp, resumeStr, jobExpectations, matchjobsJsonStr)
	g.Log().Line().Debugf(ctx, "generate resume match prompt :/n%s", prompt)

	completion, err := llm.GenerateMatchJobByResumeResult(ctx, prompt)
	if err != nil {
		g.Log().Line().Error(ctx, "generate match job by resume result error : ", err)
		return
	}
	g.Log().Line().Debugf(ctx, "generate match job by resume result :\n%s", completion)

	var outputJobList []dto.UserMatchedJobPromptOutput
	outputJson, err := gjson.LoadContent(gconv.Bytes(completion))
	if err != nil {
		g.Log().Line().Errorf(ctx, "decode prompt result json error :\n%s", err)
		return
	}

	outputJsonMap := outputJson.Map()
	for key := range outputJsonMap {
		jobJsonArray := outputJson.GetJsons(key)
		if len(jobJsonArray) == 0 {
			continue
		}
		outputJson.GetJson(key).Scan(&outputJobList)
		break
	}

	var matchJobs []entity.UserMatchedJob
	for _, outputJob := range outputJobList {
		matchJob := entity.UserMatchedJob{
			UserId:      userInfo.Id,
			JobId:       outputJob.JobId,
			MatchScore:  outputJob.MatchScore,
			MatchReason: outputJob.Reason,
		}
		matchJobs = append(matchJobs, matchJob)
	}

	err = userMatchedDao.CreateMatchJobIfNotExist(ctx, matchJobs)
	if err != nil {
		g.Log().Line().Error(ctx, "create match job if not exist error : ", err)
	}
}
