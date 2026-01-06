package start

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/util/gconv"
)

// Constants for start module
const (
	StartCommandErrorReply = "Hi %s ! I'm a bot that can help you find a job. Seems like there is something wrong with my service. Please try again later."
	StartCommandReply      = "Hi %s ! I'm a bot that can help you find a job. You can use /jobs to get all available jobs for you. \nYou can use /upload_resume to upload your resume."
)

func Handle(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	userTelegramId := update.Message.From.ID
	userName := update.Message.From.LastName + " " + update.Message.From.FirstName
	userInfoEntity, err := userInfoDao.GetUserInfoByTelegramId(ctx, gconv.String(userTelegramId))

	var replyMessage string
	var errorMessage = fmt.Sprintf(StartCommandErrorReply, userName)
	var greetingMessage = fmt.Sprintf(StartCommandReply, userName)
	if err != nil {
		g.Log().Line().Error(ctx, "get user info error : ", err)
		replyMessage = errorMessage
	}

	if userInfoEntity.Id == "" {
		userInfoEntity = entity.UserInfo{
			TelegramId: gconv.String(userTelegramId),
			Name:       userName,
		}
		err = userInfoDao.CreateUserInfoIfNotExist(ctx, userInfoEntity)
		if err != nil {
			g.Log().Line().Error(ctx, "create user info error : ", err)
			replyMessage = errorMessage
		} else {
			replyMessage = greetingMessage
		}
	} else {
		replyMessage = greetingMessage
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   replyMessage,
	})
}

// HandleTextInput handles text input after /start command
func HandleTextInput(ctx context.Context, b *bot.Bot, update *models.Update) {
	// Start command doesn't expect text input
}
