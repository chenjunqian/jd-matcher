package telegram

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/model/entity"
	"jd-matcher/internal/service/llm"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
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
		handleStartCommand(ctx, b, update, &dao.UserInfo)
	case "/help":
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "Use /upload_resume to upload your resume first.\nThen you can use /jobs to get all available jobs for you.",
		})

	case "/jobs":
		handleJobsCommand(ctx, b, update, &dao.UserInfo)
	case "/upload_resume":
		handleUploadResumeCommand(ctx, b, update, &dao.UserInfo)
	}
}

func handleStartCommand(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	userTelegramId := update.Message.From.ID
	userName := update.Message.From.LastName + " " + update.Message.From.FirstName
	userInfoEntity, err := userInfoDao.GetUserInfoByTelegramId(ctx, gconv.String(userTelegramId))

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

func handleJobsCommand(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	userInfo, err := userInfoDao.GetUserInfoByTelegramId(ctx, gconv.String(update.Message.From.ID))
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
	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:      update.Message.Chat.ID,
		Text:        replyMessage,
		ReplyMarkup: replyMarkup,
	})
}

func handleUploadResumeCommand(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {

	isResumeExist, err := userInfoDao.IsUserHasUploadResume(ctx, gconv.String(update.Message.From.ID))
	if err != nil {
		g.Log().Line().Error(ctx, "check user resume exist error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "There is something wrong with my service. Please try again later.",
		})
		return
	}

	if isResumeExist {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "You have already uploaded your resume. If you want to update your resume, please upload it again.",
		})
		return
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   "Please upload your resume file.",
	})
}

func handleResumeFileUpload(ctx context.Context, b *bot.Bot, update *models.Update) {
	getUploadResumeFIle(ctx, b, update, &dao.UserInfo)
}

func getUploadResumeFIle(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {

	if !gstr.HasPrefix(update.Message.Document.MimeType, "text/") {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "Please upload your resume with text file.",
		})
		return
	}

	receivedFile, err := b.GetFile(ctx, &bot.GetFileParams{
		FileID: update.Message.Document.FileID,
	})

	if err != nil {
		g.Log().Line().Error(ctx, "get file error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "There is something wrong with my service. Please try again later.",
		})
		return
	}

	// converResult, err := markitdown.Convert(receivedFile.FilePath, receivedFile.FilePath)
	// if err != nil {
	// 	g.Log().Line().Error(ctx, "convert file error : ", err)
	// 	b.SendMessage(ctx, &bot.SendMessageParams{
	// 		ChatID: update.Message.Chat.ID,
	// 		Text:   "There is something wrong with my service. Please try again later.",
	// 	})
	// 	return
	// }
	// g.Log().Line().Debugf(ctx, "Convert file result: %s", converResult)

	downloadLink := b.FileDownloadLink(receivedFile)
	g.Log().Line().Debugf(ctx, "Get resume download link: %s", downloadLink)

	if resp, err := g.Client().Get(ctx, downloadLink); err != nil {
		g.Log().Line().Error(ctx, "Get resume file failed : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "There is something wrong with my service. Please try again later.",
		})
		return
	} else {
		defer resp.Close()
		resumeContent := resp.ReadAllString()
		g.Log().Line().Debugf(ctx, "Get resume content: %s", resumeContent)
		if resumeContent != "" {
			vector, err := llm.GetOpenAIClient().EmbeddingText(ctx, []string{resumeContent})
			if err != nil {
				g.Log().Line().Error(ctx, "embedding resume error : ", err)
				b.SendMessage(ctx, &bot.SendMessageParams{
					ChatID: update.Message.Chat.ID,
					Text:   "There is something wrong with my service. Please try again later.",
				})
				return
			}
			err = userInfoDao.UpdateUserResume(ctx, gconv.String(update.Message.From.ID), resumeContent, vector[0])
			if err != nil {
				g.Log().Line().Error(ctx, "update user resume error : ", err)
				b.SendMessage(ctx, &bot.SendMessageParams{
					ChatID: update.Message.Chat.ID,
					Text:   "There is something wrong with my service. Please try again later.",
				})
				return
			}
			b.SendMessage(ctx, &bot.SendMessageParams{
				ChatID: update.Message.Chat.ID,
				Text:   "Your resume has been uploaded! Now you can use /jobs to get all available jobs for you.",
			})
		}
	}
}
