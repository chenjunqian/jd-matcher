package telegram

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/util/gconv"
)

var telegramBot *bot.Bot

func InitTelegramBot(ctx context.Context) {
	g.Log().Line().Info(ctx, "Init telegram bot")
	botToken := g.Cfg().MustGetWithEnv(ctx, "telegram.bot.token").String()
	opts := []bot.Option{
		bot.WithDefaultHandler(defaultHandler),
		bot.WithCallbackQueryDataHandler(MATCHED_JOBS_CALLBACK_DATA_PREFIX, bot.MatchTypePrefix, matchedJobsCallbackHandler),
	}

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

	g.Log().Line().Info(ctx, "Closing telegram bot before launching")
	closeTelegramBot(ctx, telegramBot)
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
			(latestBotMessage.Message == UPLOAD_RESUME_HINT || latestBotMessage.Message == RESUME_EXIST_REPLY) {
			AddMessage(update.Message.Chat.ID, ChatFromUser, CommandType, update.Message.Chat.ID, "")
			handleResumeFileUpload(ctx, b, update)
			return
		}

		// default user text message
		AddMessage(update.Message.Chat.ID, ChatFromUser, CommandType, update.Message.Chat.ID, update.Message.Text)
	}

}

func GetTelegramBot() *bot.Bot {
	return telegramBot
}
