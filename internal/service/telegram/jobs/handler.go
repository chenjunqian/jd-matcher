package jobs

import (
	"context"
	"jd-matcher/internal/dao"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/util/gconv"
)

// Constants for jobs module
const (
	LoginHint = "Please use /start command to login again."
)

func Handle(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	userInfo, err := userInfoDao.GetUserInfoByTelegramId(ctx, gconv.String(update.Message.From.ID))
	if err != nil {
		g.Log().Line().Error(ctx, "get user info error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   LoginHint,
		})
		return
	} else if userInfo.Id == "" {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   LoginHint,
		})
		return
	}
	replyMarkup, replyMessage, err := BuildKeyboard(ctx, userInfo.Id, update)
	if err != nil {
		g.Log().Line().Error(ctx, "build matched job list inline keyboard error : ", err)
		return
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:      update.Message.Chat.ID,
		Text:        replyMessage,
		ReplyMarkup: replyMarkup,
	})
}
