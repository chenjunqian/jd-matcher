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
		handleCommandReply(ctx, b, update, update.Message.Text)
	}

}

func GetTelegramBot() *bot.Bot {
	return telegramBot
}
