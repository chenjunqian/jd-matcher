package telegram

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

func getAllCommands() []models.BotCommand {
	return []models.BotCommand{
		{
			Command:     "start",
			Description: "Go start to find a job!",
		},
		{
			Command:     "help",
			Description: "Get how to use this bot",
		},
		{
			Command:     "jobs",
			Description: "Get all available jobs for you",
		},
		{
			Command:     "upload_resume",
			Description: "Upload your resume",
		},
	}
}

func handleCommandReply(ctx context.Context, b *bot.Bot, update *models.Update, command string) {

	switch command {
	case "/start":
		userTelegramId := update.Message.From.ID
		userName := update.Message.From.LastName + " " + update.Message.From.FirstName
		userInfoEntity, err := dao.GetUserInfoByTelegramId(ctx, gconv.String(userTelegramId))

		var replyMessage string
		var errorMessage = fmt.Sprintf("Hi %s ! I'm a bot that can help you find a job. Seems like there is something wrong with my service. Please try again later.", userName)
		var greetingMessage = fmt.Sprintf("Hi %s ! I'm a bot that can help you find a job. You can use /jobs to get all available jobs for you. \nYou can use /upload_resume to upload your resume.", userName)
		if err != nil {
			g.Log().Line().Error(ctx, "get user info error : ", err)
			replyMessage = errorMessage
		}

		if userInfoEntity.Id == "" {
			userInfoEntity = entity.UserInfo{
				TelegramId: gconv.String(userTelegramId),
				Name:       userName,
			}
			err = dao.CreateUserInfoIfNotExist(ctx, userInfoEntity)
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
	case "/help":
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "Use /upload_resume to upload your resume first.\nThen you can use /jobs to get all available jobs for you.",
		})

	case "/jobs":
		replyMarkup, replyMessage, err := buildMatchedJobListInlineKeyboard(ctx, update)
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
}
