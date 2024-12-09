package telegram

import (
	"context"
	"jd-matcher/internal/dao"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/util/gconv"
)

func matchedJobsCallbackHandler(ctx context.Context, b *bot.Bot, update *models.Update) {
	matchedJobsCallback(ctx, b, update, &dao.UserInfo)
}

func matchedJobsCallback(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo)  {
	
	g.Log().Line().Debugf(ctx, "update: %v", gconv.String(update))
	userInfo, err := userInfoDao.GetUserInfoByTelegramId(ctx, gconv.String(update.CallbackQuery.From.ID))
	if err != nil {
		g.Log().Line().Error(ctx, "get user info error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "There is something wrong with my service. Please try again later.",
		})
		return
	} else if userInfo.Id == "" {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "Please use /start command to login again.",
		})
		return
	}
	replyMarkup, replyMessage, err := getMatchedJobListInlineKeyboard(ctx, userInfo.Id, update)
	if err != nil {
		g.Log().Line().Error(ctx, "build matched job list inline keyboard error : ", err)
		return
	}

	respMsg, err := b.EditMessageText(ctx, &bot.EditMessageTextParams{
		ChatID:      update.CallbackQuery.Message.Message.Chat.ID,
		MessageID:   update.CallbackQuery.Message.Message.ID,
		Text:        replyMessage,
		ReplyMarkup: replyMarkup,
	})

	if err != nil {
		g.Log().Line().Error(ctx, "edit message error : ", err)
		g.Log().Line().Error(ctx, "edit failed response message : ", gconv.String(respMsg))
	}
}
