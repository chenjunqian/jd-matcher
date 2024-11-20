package service

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
)

var telegramBot *bot.Bot

func InitTelegramBot(ctx context.Context) {
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

}

func GetTelegramBot() *bot.Bot {
	return telegramBot
}
