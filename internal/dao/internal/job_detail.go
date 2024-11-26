// ==========================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// ==========================================================================

package internal

import (
	"context"

	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/frame/g"
)

// JobDetailDao is the data access object for table job_detail.
type JobDetailDao struct {
	table   string           // table is the underlying table name of the DAO.
	group   string           // group is the database configuration group name of current DAO.
	columns JobDetailColumns // columns contains all the column names of Table for convenient usage.
}

// JobDetailColumns defines and stores column names for table job_detail.
type JobDetailColumns struct {
	Id       string //
	Title    string //
	JobDesc  string //
	JobTags  string //
	Link     string //
	Source   string //
	Location string //
	Salary   string //
}

// jobDetailColumns holds the columns for table job_detail.
var jobDetailColumns = JobDetailColumns{
	Id:       "id",
	Title:    "title",
	JobDesc:  "job_desc",
	JobTags:  "job_tags",
	Link:     "link",
	Source:   "source",
	Location: "location",
	Salary:   "salary",
}

// NewJobDetailDao creates and returns a new DAO object for table data access.
func NewJobDetailDao() *JobDetailDao {
	return &JobDetailDao{
		group:   "default",
		table:   "job_detail",
		columns: jobDetailColumns,
	}
}

// DB retrieves and returns the underlying raw database management object of current DAO.
func (dao *JobDetailDao) DB() gdb.DB {
	return g.DB(dao.group)
}

// Table returns the table name of current dao.
func (dao *JobDetailDao) Table() string {
	return dao.table
}

// Columns returns all column names of current dao.
func (dao *JobDetailDao) Columns() JobDetailColumns {
	return dao.columns
}

// Group returns the configuration group name of database of current dao.
func (dao *JobDetailDao) Group() string {
	return dao.group
}

// Ctx creates and returns the Model for current DAO, It automatically sets the context for current operation.
func (dao *JobDetailDao) Ctx(ctx context.Context) *gdb.Model {
	return dao.DB().Model(dao.table).Safe().Ctx(ctx)
}

// Transaction wraps the transaction logic using function f.
// It rollbacks the transaction and returns the error from function f if it returns non-nil error.
// It commits the transaction and returns nil if function f returns nil.
//
// Note that, you should not Commit or Rollback the transaction in function f
// as it is automatically handled by this function.
func (dao *JobDetailDao) Transaction(ctx context.Context, f func(ctx context.Context, tx gdb.TX) error) (err error) {
	return dao.Ctx(ctx).Transaction(ctx, f)
}
