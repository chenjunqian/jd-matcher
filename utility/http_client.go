package utility

import (
	"context"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/gclient"
)


func GetHttpClient() *gclient.Client {
	return g.Client()
}

func GetContent(ctx context.Context, url string) (string, error) {
	resp, err := g.Client().Get(ctx, url)
	defer resp.Close()
	if err != nil {
		g.Log().Line().Error(ctx, err)
		return "", err
	}
	return resp.ReadAllString(), nil
}