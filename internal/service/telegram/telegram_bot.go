package telegram

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/service/telegram/all_jobs"
	"jd-matcher/internal/service/telegram/jobs"
	"jd-matcher/internal/service/telegram/upload_resume"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

var telegramBot *bot.Bot

func InitTelegramBot(ctx context.Context) {
	g.Log().Line().Info(ctx, "Init telegram bot")
	botToken := g.Cfg().MustGetWithEnv(ctx, "telegram.bot.token").String()
	opts := []bot.Option{
		bot.WithDefaultHandler(defaultHandler),
	}

	// Register callback handlers from sub-modules
	opts = append(opts,
		bot.WithCallbackQueryDataHandler(all_jobs.CallbackDataPrefix, bot.MatchTypePrefix, all_jobs.CallbackHandler),
		bot.WithCallbackQueryDataHandler(jobs.CallbackDataPrefix, bot.MatchTypePrefix, jobs.CallbackHandler),
	)

	var err error
	telegramBot, err = bot.New(botToken, opts...)
	if err != nil {
		panic(err)
	}

	myCommandParams := bot.SetMyCommandsParams{
		Commands:     getAllCommands(),
		LanguageCode: "en",
	}
	telegramBot.SetMyCommands(ctx, &myCommandParams)

	go func() {
		<-ctx.Done()
		closeTelegramBot(ctx, telegramBot)
	}()

	g.Log().Line().Info(ctx, "Launch telegram bot")
	go telegramBot.Start(ctx)

}

func closeTelegramBot(ctx context.Context, b *bot.Bot) {
	closed, err := b.Close(ctx)
	if err != nil || !closed {
		g.Log().Line().Error(ctx, "Close telegram bot error : ", err)
	} else {
		g.Log().Line().Info(ctx, "Close telegram bot success")
	}
}

func defaultHandler(ctx context.Context, b *bot.Bot, update *models.Update) {
	g.Log().Line().Debugf(ctx, "update: %v", gconv.String(update))
	var messageType models.MessageEntityType
	if update.Message != nil && update.Message.Entities != nil && len(update.Message.Entities) > 0 {
		messageType = update.Message.Entities[0].Type
	}

	if messageType == models.MessageEntityTypeBotCommand {
		AddMessage(update.Message.Chat.ID, ChatFromUser, CommandType, update.Message.Chat.ID, update.Message.Text)
		handleCommandReply(ctx, b, update, update.Message.Text)
	} else {
		latestBotMessage := GetLatestMessage(update.Message.Chat.ID, ChatFromBot)
		// user upload resume
		if update.Message != nil &&
			update.Message.Document != nil &&
			(latestBotMessage.Message == upload_resume.UploadResumeHint || latestBotMessage.Message == upload_resume.ResumeExistReply) {
			AddMessage(update.Message.Chat.ID, ChatFromUser, CommandType, update.Message.Chat.ID, "")
			handleResumeFileUpload(ctx, b, update)
			return
		}

		// user input expectation
		if update.Message != nil &&
			update.Message.Text != "" &&
			(latestBotMessage.Message == EXPECTATION_HINT_EMPTY || isExpectationHintExists(latestBotMessage.Message)) {

			g.Log().Line().Debugf(ctx, "this is expectation update message: %v", gconv.String(update))
			AddMessage(update.Message.Chat.ID, ChatFromUser, CommandType, update.Message.Chat.ID, update.Message.Text)
			handleExpectationTextInput(ctx, b, update, &dao.UserInfo)
			return
		}

		// default user text message
		AddMessage(update.Message.Chat.ID, ChatFromUser, CommandType, update.Message.Chat.ID, update.Message.Text)
	}

}

func GetTelegramBot() *bot.Bot {
	return telegramBot
}

// isExpectationHintExists checks if the message is an expectation hint that was shown to existing users
// It checks if the message starts with "Your current expectations:"
func isExpectationHintExists(message string) bool {
	isExpectationReply := gstr.HasPrefix(message, "Your current expectations:")

	return isExpectationReply
}
