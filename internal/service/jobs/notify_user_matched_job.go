package jobs

import (
	"context"
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
		runNotifyUserMatchedJob(ctx)
		finishTime := gtime.Now()
		g.Log().Line().Infof(ctx, "notify matched job cost %s", finishTime.Sub(startTime).String())
	}, "notify_matched_job")

	if err != nil {
		g.Log().Line().Error(ctx, "add notify matched job error :", err)
	} else {
		g.Log().Line().Info(ctx, "add notify matched job success")
	}
}

func runNotifyUserMatchedJob(ctx context.Context) {
	g.Log().Line().Info(ctx, "start notify matched job")

	totalUserCount, err := dao.GetAllUserInfoCount(ctx)
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
			userInfoList, err := dao.GetUserInfoList(ctx, i, 100)
			if err != nil {
				g.Log().Line().Error(ctx, "get user info list error : ", err)
				return
			}

			for _, userInfo := range userInfoList {
				notifyUserNewMatchJob(ctx, userInfo)
			}
		}
	} else {
		userInfoList, err := dao.GetUserInfoList(ctx, 0, totalUserCount)
		if err != nil {
			g.Log().Line().Error(ctx, "get user info list error : ", err)
			return
		}

		for _, userInfo := range userInfoList {
			notifyUserNewMatchJob(ctx, userInfo)
		}
	}
}

func notifyUserNewMatchJob(ctx context.Context, userInfo entity.UserInfo) {

	userNonNotifiedCount, err := dao.GetUserNonNotifiedJobTotalCount(ctx, userInfo.Id)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get user %s non notified job total count failed : %v", userInfo.Id, err)
		return
	}
	if userNonNotifiedCount == 0 {
		return
	}

	replyMarkup, replyMessage, err := telegram.BuildMatchedJobListNotificationInlineKeyboard(ctx, userInfo.TelegramId, nil)
	if err != nil {
		g.Log().Line().Errorf(ctx, "build matched job list notification inline keyboard error : %v", err)
		return
	}

	respMsg, err := telegram.GetTelegramBot().SendMessage(ctx, &bot.SendMessageParams{
		ChatID:      userInfo.TelegramId,
		Text:        replyMessage,
		ReplyMarkup: replyMarkup,
	})

	if err != nil {
		g.Log().Line().Errorf(ctx, "send user %s matched job edit message error : %v", userInfo.Id, err)
		g.Log().Line().Errorf(ctx, "send user %s matched job edit failed response message : %s", userInfo.Id, gconv.String(respMsg))
	}
}
