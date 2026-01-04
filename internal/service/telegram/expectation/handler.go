package expectation

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/util/gconv"
)

// Constants for expectation module
const (
	CommonErrorReply = "There is something wrong with my service. Please try again later."
	LoginHint        = "Please use /start command to login again."
	ExpectationHintEmpty = "Please enter your job expectations. This will help us find better matching jobs for you. For example: 'Remote, Shanghai, Python, English'"
	ExpectationHintExists = "Your current expectations:\n---\n%s\n---\nPlease enter your new expectations. This will OVERWRITE your previous expectations."
	ExpectationSuccessReply = "Your job expectations have been saved!"
)

func Handle(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	userInfo, err := userInfoDao.GetUserInfoByTelegramId(ctx, gconv.String(update.Message.From.ID))
	if err != nil {
		g.Log().Line().Error(ctx, "get user info error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   CommonErrorReply,
		})
		return
	} else if userInfo.Id == "" {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   LoginHint,
		})
		return
	}

	var replyMessage string
	if userInfo.JobExpectations != "" {
		replyMessage = fmt.Sprintf(ExpectationHintExists, userInfo.JobExpectations)
	} else {
		replyMessage = ExpectationHintEmpty
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   replyMessage,
	})
}

// HandleTextInput handles text input for job expectations
func HandleTextInput(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	userInput := update.Message.Text
	if userInput == "" {
		return
	}

	err := userInfoDao.UpdateUserJobExpectations(ctx, gconv.String(update.Message.From.ID), userInput)
	if err != nil {
		g.Log().Line().Error(ctx, "update user job expectations error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   CommonErrorReply,
		})
		return
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   ExpectationSuccessReply,
	})
}
