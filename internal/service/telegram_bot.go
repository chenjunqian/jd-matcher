package service

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
	}

	telegramBot, err := bot.New(botToken, opts...)
	if err != nil {
		panic(err)
	}

	telegramBot.Start(ctx)

}

func defaultHandler(ctx context.Context, b *bot.Bot, update *models.Update) {
	g.Log().Line().Debugf(ctx, "message: %v", gconv.String(update.Message))
	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   "Hello, world!",
	})
}

func GetTelegramBot() *bot.Bot {
	return telegramBot
}
