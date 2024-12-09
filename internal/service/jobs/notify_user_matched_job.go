package jobs

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/telegram"

	"github.com/go-telegram/bot"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcron"
	"github.com/gogf/gf/v2/os/gtime"
	"github.com/gogf/gf/v2/util/gconv"
)

func StartNotifyUserMatchedJob(ctx context.Context) {

	_, err := gcron.Add(ctx, "0 0 */3 * * *", func(ctx context.Context) {
		startTime := gtime.Now()
		runNotifyUserMatchedJob(ctx, &dao.UserInfo, &dao.UserMatchedJob)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "notify matched job cost %s", finishTime.Sub(startTime).String())
	}, "notify_matched_job")
	runNotifyUserMatchedJob(ctx, &dao.UserInfo, &dao.UserMatchedJob)

	if err != nil {
		g.Log().Line().Error(ctx, "add notify matched job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add notify matched job success")
	}
}

func runNotifyUserMatchedJob(ctx context.Context, userInfoDao dao.IUserInfo, userMatchedDao dao.IUserMatchedJob) (err error) {
	g.Log().Line().Info(ctx, "start notify matched job")

	totalUserCount, err := userInfoDao.GetAllUserInfoCount(ctx)
	if err != nil {
		g.Log().Line().Error(ctx, "get user info count error : ", err)
		return
	}

	if totalUserCount == 0 {
		g.Log().Line().Info(ctx, "no user info")
		return
	}

	if totalUserCount > 100 {
		// if total count more than 100, use batch embedding, query 100 at a time
		for i := 0; i < totalUserCount; i += 100 {
			var userInfoList []entity.UserInfo
			userInfoList, err = userInfoDao.GetUserInfoList(ctx, i, 100)
			if err != nil {
				g.Log().Line().Error(ctx, "get user info list error : ", err)
				return
			}

			for _, userInfo := range userInfoList {
				notifyUserNewMatchJob(ctx, userInfo, userMatchedDao)
			}
		}
	} else {
		var userInfoList []entity.UserInfo
		userInfoList, err = userInfoDao.GetUserInfoList(ctx, 0, totalUserCount)
		if err != nil {
			g.Log().Line().Error(ctx, "get user info list error : ", err)
			return
		}

		for _, userInfo := range userInfoList {
			notifyUserNewMatchJob(ctx, userInfo, userMatchedDao)
		}
	}

	return
}

func notifyUserNewMatchJob(ctx context.Context, userInfo entity.UserInfo, userMatchedDao dao.IUserMatchedJob) {

	userNonNotifiedCount, err := userMatchedDao.GetUserNonNotifiedJobTotalCount(ctx, userInfo.Id)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get user %s non notified job total count failed : %v", userInfo.Id, err)
		return
	}
	if userNonNotifiedCount == 0 {
		return
	}

	userMatchJobList, err := userMatchedDao.GetUserNonNotifiedJobList(ctx, userInfo.Id, 0, 10)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get user %s non notified job list failed : %v", userInfo.Id, err)
		return
	} else if len(userMatchJobList) == 0 {
		return
	}

	var replyMessage string
	for _, job := range userMatchJobList {
		replyMessage = replyMessage + fmt.Sprintf("Title : %s\nLink : %s\nLocation : %s\nSalary : %s\nMatch Score : %s\nDate : %s\n\n", job.Title, job.Link, job.Location, job.Salary, job.MatchScore, job.UpdateTime.Format("Y-m-d"))
	}

	if replyMessage != "" {
		totalCount, err := userMatchedDao.GetUserMatchedJobDetailListTotalCount(ctx, userInfo.Id)
		if err != nil {
			g.Log().Line().Errorf(ctx, "get user %s matched job total count failed : %v", userInfo.Id, err)
			replyMessage = "You have new matched jobs, please check. \n\n" + replyMessage + "You can use /jobs to get all available jobs for you."
		} else {
			replyMessage = "You have new matched jobs, please check. \n\n" + replyMessage + "You can use /jobs to get all available jobs for you.\n\nTotal matched jobs : " + gconv.String(totalCount)
		}
	}

	respMsg, err := telegram.GetTelegramBot().SendMessage(ctx, &bot.SendMessageParams{
		ChatID: userInfo.TelegramId,
		Text:   replyMessage,
	})

	userMatchedDao.UpdateAllMatchJobNotified(ctx, userInfo.Id)

	if err != nil {
		g.Log().Line().Errorf(ctx, "send user %s matched job edit message error : %v", userInfo.Id, err)
		g.Log().Line().Errorf(ctx, "send user %s matched job edit failed response message : %s", userInfo.Id, gconv.String(respMsg))
	}
}
