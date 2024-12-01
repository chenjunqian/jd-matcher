// =================================================================================
// This is auto-generated by GoFrame CLI tool only once. Fill this file as you wish.
// =================================================================================

package dao

import (
	"context"
	"errors"
	"jd-matcher/internal/dao/internal"
	"jd-matcher/internal/model/entity"

	"github.com/gogf/gf/v2/frame/g"

	"github.com/pgvector/pgvector-go"
)

// internalJobDetailDao is internal type for wrapping internal DAO implements.
type internalJobDetailDao = *internal.JobDetailDao

// jobDetailDao is the data access object for table job_detail.
// You can define custom methods on it to extend its functionality as you wish.
type jobDetailDao struct {
	internalJobDetailDao
}

var (
	// JobDetail is globally public accessible object for table job_detail operations.
	JobDetail = jobDetailDao{
		internal.NewJobDetailDao(),
	}
)

// Fill with you ideas below.
func CreateJobDetailIfNotExist(ctx context.Context, jobDetails []entity.JobDetail) error {
	var allError []error
	for _, jobDetail := range jobDetails {
		var existEntity entity.JobDetail
		var err error
		JobDetail.Ctx(ctx).Where("link = ?", jobDetail.Link).Scan(&existEntity)
		if existEntity.Id != "" {
			g.Log().Line().Debugf(ctx, "job link %s exist, skip it", jobDetail.Link)
			continue
		}
		if jobDetail.JobTags == nil {
			jobDetail.JobTags = []string{}
		}

		_, err = g.Model("job_detail").Ctx(ctx).Data(g.Map{
			"id":          jobDetail.Id,
			"title":       jobDetail.Title,
			"job_desc":    jobDetail.JobDesc,
			"job_tags":    jobDetail.JobTags,
			"link":        jobDetail.Link,
			"source":      jobDetail.Source,
			"location":    jobDetail.Location,
			"salary":      jobDetail.Salary,
			"update_time": jobDetail.UpdateTime,
		}).Insert()
		if err != nil {
			allError = append(allError, err)
		}
	}

	return errors.Join(allError...)
}

func GetJobDetailById(ctx context.Context, id string) (result entity.JobDetail, err error) {
	err = JobDetail.Ctx(ctx).Where("id = ?", id).Scan(&result)
	return result, err
}

func GetLatestJobList(ctx context.Context, offset, limit int) (entities []entity.JobDetail, err error) {

	err = JobDetail.Ctx(ctx).Order("update_time desc").Limit(limit).Offset(offset).Scan(&entities)

	return
}

func GetEmptyJobDescEmbeddingJobDetailTotalCount(ctx context.Context) (count int, err error) {

	count, err = JobDetail.Ctx(ctx).Where("job_desc_embedding is null").Count()

	return
}

func GetEmptyJobDescEmbeddingJobList(ctx context.Context, offset, limit int) (entities []entity.JobDetail, err error) {

	err = JobDetail.Ctx(ctx).Where("job_desc_embedding is null").Order("update_time desc").Limit(limit).Offset(offset).Scan(&entities)

	return
}

func UpdateJobDetailEmbedding(ctx context.Context, entity entity.JobDetail) (err error) {
	_, err = JobDetail.Ctx(ctx).Data(g.Map{"job_desc_embedding": pgvector.NewVector(entity.JobDescEmbedding)}).Where("id = ?", entity.Id).Update()
	return
}

func QueryJobDetailByEmbedding(ctx context.Context, embedding []float32) (entities []entity.JobDetail, err error) {
	err = JobDetail.Ctx(ctx).Raw("SELECT * FROM job_detail ORDER BY job_desc_embedding <-> ? LIMIT 10;", pgvector.NewVector(embedding)).Scan(&entities)
	return
}
